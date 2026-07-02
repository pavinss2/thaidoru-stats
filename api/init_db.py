import os
import csv
import psycopg2

def migrate_csv_to_postgres():
    # Connect using environment variable
    url = os.environ.get("POSTGRES_URL")
    if not url:
        print("Error: POSTGRES_URL environment variable is not set.")
        return
        
    print("Connecting to PostgreSQL database...")
    try:
        conn = psycopg2.connect(url)
        cursor = conn.cursor()
    except Exception as e:
        print(f"Connection failed: {e}")
        return

    # Create table schema
    print("Checking database table schema...")
    create_table_query = """
    CREATE TABLE IF NOT EXISTS follower_history (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        timestamp TIME,
        idol_name VARCHAR(100) NOT NULL,
        platform VARCHAR(50) NOT NULL,
        username VARCHAR(100),
        follower_count INT NOT NULL,
        UNIQUE (date, idol_name, platform)
    );
    """
    try:
        cursor.execute(create_table_query)
        conn.commit()
    except Exception as e:
        print(f"Error creating table: {e}")
        cursor.close()
        conn.close()
        return

    # Migrate CSV records
    csv_path = "follower_history.csv"
    if not os.path.exists(csv_path):
        print(f"Source file '{csv_path}' not found. Skipping data migration.")
        cursor.close()
        conn.close()
        return
        
    print(f"Reading records from '{csv_path}'...")
    records = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        headers = next(reader)
        # Headers: Date,Timestamp,Idol_Name,Platform,Username,Follower_Count
        for row in reader:
            if len(row) == 6:
                records.append(row)

    print(f"Migrating {len(records)} records to PostgreSQL (using ON CONFLICT DO UPDATE)...")
    try:
        for r in records:
            # r: Date, Timestamp, Idol_Name, Platform, Username, Follower_Count
            ts = r[1] if r[1] else None
            cursor.execute("""
                INSERT INTO follower_history (date, timestamp, idol_name, platform, username, follower_count)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (date, idol_name, platform) DO UPDATE
                SET username = EXCLUDED.username, follower_count = EXCLUDED.follower_count, timestamp = EXCLUDED.timestamp;
            """, (r[0], ts, r[2], r[3], r[4], int(r[5])))
        conn.commit()
        print("Migration completed successfully!")
    except Exception as e:
        print(f"Error during migration: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    migrate_csv_to_postgres()
