import os
import json
from http.server import BaseHTTPRequestHandler
import psycopg2
from psycopg2.extras import RealDictCursor

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        url = os.environ.get("POSTGRES_URL")
        if not url:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": "POSTGRES_URL connection secret is not configured."}).encode('utf-8'))
            return
            
        try:
            conn = psycopg2.connect(url)
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Select columns mapped to match CSV uppercase format
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
            
            cursor.close()
            conn.close()
            
            # Ensure Follower_Count values are strings matching CSV string-parsed rows
            for r in rows:
                r["Follower_Count"] = str(r["Follower_Count"])
                
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(rows).encode('utf-8'))
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
