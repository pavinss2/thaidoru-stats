import os
import csv
import psycopg2

def main():
    # 1. Resolve postgres connection string
    postgres_url = os.environ.get("POSTGRES_URL")
    
    # Try fallback to .env.local if populated
    if not postgres_url:
        env_path = ".env.local"
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
        print("Error: POSTGRES_URL environment variable is not set and could not be loaded from .env.local.")
        print("Please run the script by passing the variable, for example:")
        print("  POSTGRES_URL=\"postgres://user:pass@host/db\" python3 import_csv_to_postgres.py")
        return

    csv_path = "follower_history.csv"
    if not os.path.exists(csv_path):
        print(f"Error: CSV file not found at {csv_path}")
        return

    print("Reading follower_history.csv...")
    results = []
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        headers = next(reader)
        header_indices = {h.strip(): idx for idx, h in enumerate(headers)}
        
        for row in reader:
            if len(row) < 5:
                continue
            date = row[header_indices["Date"]]
            ts = row[header_indices["Timestamp"]] if "Timestamp" in header_indices else ""
            name = row[header_indices["Idol_Name"]]
            platform = row[header_indices["Platform"]]
            username = row[header_indices["Username"]]
            count = row[header_indices["Follower_Count"]]
            
            results.append((date, ts if ts else None, name, platform, username, count))

    print(f"Loaded {len(results)} records from CSV. Connecting to PostgreSQL and migrating...")
    
    try:
        conn = psycopg2.connect(postgres_url)
        cursor = conn.cursor()
        
        for r in results:
            cursor.execute("""
                INSERT INTO follower_history (date, timestamp, idol_name, platform, username, follower_count)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (date, idol_name, platform) DO UPDATE
                SET username = EXCLUDED.username, follower_count = EXCLUDED.follower_count, timestamp = EXCLUDED.timestamp;
            """, (r[0], r[1], r[2], r[3], r[4], int(float(r[5])) if r[5] else 0))
            
        conn.commit()
        print("Successfully uploaded and resolved records in SQL.")
        
        # Run linear data interpolation/synthesis in database
        from follower_scraper import synthesize_missing_data_postgres
        print("Running data interpolation on database...")
        synthesize_missing_data_postgres(postgres_url)
        
        cursor.close()
        conn.close()
        print("Database migration completed successfully!")
        
    except Exception as e:
        print("Error during database migration:", e)

if __name__ == "__main__":
    main()
