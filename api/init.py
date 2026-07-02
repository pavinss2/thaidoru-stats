import os
import csv
import json
from http.server import BaseHTTPRequestHandler
import psycopg2

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        url = os.environ.get("POSTGRES_URL")
        if not url:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": "POSTGRES_URL is not set inside the Vercel environment."}).encode('utf-8'))
            return
            
        logs = []
        logs.append("Connecting to PostgreSQL database...")
        try:
            conn = psycopg2.connect(url)
            cursor = conn.cursor()
            logs.append("Database connected successfully!")
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"Connection failed: {e}"}).encode('utf-8'))
            return

        # 1. Create table schema
        logs.append("Creating table schema if not exists...")
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
            logs.append("Table 'follower_history' checked/created successfully!")
        except Exception as e:
            cursor.close()
            conn.close()
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"Schema creation failed: {e}", "logs": logs}).encode('utf-8'))
            return

        # 2. Parse and seed follower_history.csv
        csv_path = "follower_history.csv"
        if not os.path.exists(csv_path):
            cursor.close()
            conn.close()
            self.send_response(404)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"Source CSV '{csv_path}' not found.", "logs": logs}).encode('utf-8'))
            return

        logs.append(f"Reading historical records from '{csv_path}'...")
        records = []
        try:
            with open(csv_path, 'r', encoding='utf-8') as f:
                reader = csv.reader(f)
                next(reader) # skip headers
                for row in reader:
                    if len(row) == 6:
                        records.append(row)
        except Exception as e:
            cursor.close()
            conn.close()
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"Failed reading CSV: {e}", "logs": logs}).encode('utf-8'))
            return

        logs.append(f"Seeding/Updating {len(records)} records into PostgreSQL database...")
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
            logs.append("Data migration and seeding completed successfully!")
        except Exception as e:
            conn.rollback()
            cursor.close()
            conn.close()
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"Data seeding failed: {e}", "logs": logs}).encode('utf-8'))
            return

        cursor.close()
        conn.close()
        
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({"status": "success", "migrated_records": len(records), "logs": logs}).encode('utf-8'))
