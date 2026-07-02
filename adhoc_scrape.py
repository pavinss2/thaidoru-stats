import os
import json
from datetime import datetime
import sys
import argparse

def main():
    parser = argparse.ArgumentParser(description="Adhoc scraper to update specific idols/members directly in Neon PostgreSQL.")
    parser.add_argument("names", nargs="+", help="Names of the idols/members to scrape (e.g. Best Pin Praew).")
    parser.add_argument("--config", default="idols.json", help="Path to config JSON (default: idols.json).")
    args = parser.parse_args()

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

    today_str = datetime.today().strftime('%Y-%m-%d')
    now_time_str = datetime.today().strftime('%H:%M:%S')

    results = []
    for idol in targets:
        name = idol.get("name")
        print(f"\n--- Scraping channels for {name} ---")
        
        # Instagram
        ig = idol.get("instagram_handle")
        if ig:
            try:
                print(f"  Instagram ({ig})...")
                count = scrape_instagram(ig)
                print(f"    Followers: {count:,}")
                results.append((today_str, now_time_str, name, "Instagram", ig, count))
            except Exception as e:
                print(f"    Instagram Error: {e}")
                
        # TikTok
        tiktok = idol.get("tiktok_handle")
        if tiktok:
            try:
                print(f"  TikTok ({tiktok})...")
                count = scrape_tiktok(tiktok)
                print(f"    Followers: {count:,}")
                results.append((today_str, now_time_str, name, "TikTok", tiktok, count))
            except Exception as e:
                print(f"    TikTok Error: {e}")

        # X
        x = idol.get("x_handle")
        if x:
            try:
                print(f"  X ({x})...")
                count = scrape_x(x)
                print(f"    Followers: {count:,}")
                results.append((today_str, now_time_str, name, "X", x, count))
            except Exception as e:
                print(f"    X Error: {e}")

        # Facebook
        fb = idol.get("facebook_page")
        if fb:
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
            print("Completed successfully!")
        except Exception as e:
            print("Error writing to database:", e)
    else:
        print("\nNo results scraped. Exiting.")

if __name__ == "__main__":
    main()
