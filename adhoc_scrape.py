import os
import json
from datetime import datetime, timezone, timedelta
import sys
import argparse

def sync_postgres_to_csv(postgres_url, csv_path):
    print(f"Connecting to PostgreSQL database to sync records to {csv_path}...")
    import psycopg2
    from psycopg2.extras import RealDictCursor
    import csv

    try:
        conn = psycopg2.connect(postgres_url)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT 
                to_char(date, 'YYYY-MM-DD') as "Date", 
                coalesce(to_char(timestamp, 'HH24:MI:SS'), '') as "Timestamp", 
                idol_name as "Idol_Name", 
                platform as "Platform", 
                username as "Username", 
                follower_count as "Follower_Count"
            FROM follower_history 
            ORDER BY date ASC, idol_name ASC, platform ASC;
        """)
        rows = cursor.fetchall()
        
        headers = ["Date", "Timestamp", "Idol_Name", "Platform", "Username", "Follower_Count"]
        with open(csv_path, 'w', encoding='utf-8', newline='') as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(headers)
            for row in rows:
                writer.writerow([
                    row["Date"],
                    row["Timestamp"],
                    row["Idol_Name"],
                    row["Platform"],
                    row["Username"],
                    str(row["Follower_Count"])
                ])
                
        print(f"Successfully synced {len(rows)} records to {csv_path}.")
        cursor.close()
        conn.close()
    except Exception as e:
        print("Error syncing database to CSV:", e)
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Adhoc scraper to update specific idols/members directly in Neon PostgreSQL.")
    parser.add_argument("names", nargs="*", help="Names of the idols/members to scrape (e.g. Best Pin Praew).")
    parser.add_argument("--config", default="idols.json", help="Path to config JSON (default: idols.json).")
    parser.add_argument("--platform", default=None, help="Filter adhoc scrape to a specific platform (e.g. Instagram, TikTok, X, Facebook).")
    parser.add_argument("--sync-csv", action="store_true", help="Sync all records from PostgreSQL database back to follower_history.csv.")
    args = parser.parse_args()

    if not args.names and not args.sync_csv:
        parser.print_help()
        sys.exit(1)

    # 1. Load env variables from .env.local
    env_path = ".env.local"
    postgres_url = None
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip() and not line.startswith('#'):
                    parts = line.strip().split('=', 1)
                    if len(parts) == 2:
                        key, val = parts[0].strip(), parts[1].strip().strip('"').strip("'")
                        if key == "POSTGRES_URL" and val:
                            postgres_url = val
                            break

    if not postgres_url:
        postgres_url = os.environ.get("POSTGRES_URL")

    if not postgres_url:
        print("Error: POSTGRES_URL environment variable is not set and could not be loaded from .env.local.")
        sys.exit(1)

    # Handle standalone CSV sync
    if args.sync_csv and not args.names:
        sync_postgres_to_csv(postgres_url, "follower_history.csv")
        print("Done!")
        return

    # Load config
    if not os.path.exists(args.config):
        print(f"Error: Config file not found at '{args.config}'")
        sys.exit(1)
        
    with open(args.config, "r", encoding="utf-8") as f:
        idols = json.load(f)

    # Resolve target profiles
    target_names_lower = [name.lower() for name in args.names]
    targets = [i for i in idols if i.get("name").lower() in target_names_lower]

    if not targets:
        print(f"Error: None of the requested members {args.names} were found in the config.")
        sys.exit(1)

    print(f"Resolved profiles to scrape: {[t['name'] for t in targets]}")

    # Import scraping actions
    from follower_scraper import scrape_instagram, scrape_tiktok, scrape_x, scrape_facebook, save_results_to_postgres, synthesize_missing_data_postgres

    TZ_BKK = timezone(timedelta(hours=7))
    now = datetime.now(TZ_BKK)
    today_str = now.strftime('%Y-%m-%d')
    now_time_str = now.strftime('%H:%M:%S')

    target_platform = args.platform.lower() if args.platform else None

    results = []
    for idol in targets:
        name = idol.get("name")
        print(f"\n--- Scraping channels for {name} ---")
        
        # Instagram
        ig = idol.get("instagram_handle")
        if ig and (not target_platform or target_platform == "instagram"):
            try:
                print(f"  Instagram ({ig})...")
                count = scrape_instagram(ig)
                print(f"    Followers: {count:,}")
                results.append((today_str, now_time_str, name, "Instagram", ig, count))
            except Exception as e:
                print(f"    Instagram Error: {e}")
                
        # TikTok
        tiktok = idol.get("tiktok_handle")
        if tiktok and (not target_platform or target_platform == "tiktok"):
            try:
                print(f"  TikTok ({tiktok})...")
                count = scrape_tiktok(tiktok)
                print(f"    Followers: {count:,}")
                results.append((today_str, now_time_str, name, "TikTok", tiktok, count))
            except Exception as e:
                print(f"    TikTok Error: {e}")

        # X
        x = idol.get("x_handle")
        if x and (not target_platform or target_platform == "x"):
            try:
                print(f"  X ({x})...")
                count = scrape_x(x)
                print(f"    Followers: {count:,}")
                results.append((today_str, now_time_str, name, "X", x, count))
            except Exception as e:
                print(f"    X Error: {e}")

        # Facebook
        fb = idol.get("facebook_page")
        if fb and (not target_platform or target_platform == "facebook"):
            try:
                print(f"  Facebook ({fb})...")
                count = scrape_facebook(fb)
                print(f"    Likes/Followers: {count:,}")
                results.append((today_str, now_time_str, name, "Facebook", fb, count))
            except Exception as e:
                print(f"    Facebook Error: {e}")

    if results:
        print("\nSaving results to PostgreSQL database...")
        try:
            save_results_to_postgres(results, postgres_url)
            print("Running database linear interpolation...")
            synthesize_missing_data_postgres(postgres_url)
            
            # Sync to CSV if requested
            if args.sync_csv:
                sync_postgres_to_csv(postgres_url, "follower_history.csv")
                
            print("Completed successfully!")
        except Exception as e:
            print("Error writing to database:", e)
    else:
        print("\nNo results scraped. Exiting.")

if __name__ == "__main__":
    main()
