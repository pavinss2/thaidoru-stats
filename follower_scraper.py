import os
import re
import json
import csv
import argparse
import time
import random
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
from bs4 import BeautifulSoup

# Standard HTTP headers
GOOGLEBOT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Accept-Language': 'en-US,en;q=0.9'
}

CHROME_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9'
}

def clean_count_str(count_str: str) -> int:
    """
    Converts abbreviation strings like '58M', '10.2K', '22,450,014' to an integer.
    """
    count_str = count_str.upper().strip().replace(',', '')
    try:
        if 'B' in count_str:
            return int(float(count_str.replace('B', '')) * 1_000_000_000)
        elif 'M' in count_str:
            return int(float(count_str.replace('M', '')) * 1_000_000)
        elif 'K' in count_str:
            return int(float(count_str.replace('K', '')) * 1_000)
        else:
            return int(float(count_str))
    except ValueError as e:
        raise ValueError(f"Could not parse count string '{count_str}': {e}")

def scrape_instagram(handle: str) -> int:
    """
    Scrapes the public follower count of an Instagram profile.
    First attempts to query instastatistics.com for the exact follower count.
    Falls back to scraping the raw Instagram public profile if instastatistics is down or rate-limited.
    """
    # 1. Attempt instastatistics.com first (for exact counts)
    try:
        url_is = f"https://instastatistics.com/{handle}"
        time.sleep(random.uniform(0.5, 1.5))
        
        headers_is = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        }
        
        response = requests.get(url_is, headers=headers_is, timeout=10)
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            desc_tag = soup.find('meta', attrs={'name': 'description'}) or soup.find('meta', attrs={'property': 'og:description'})
            content = desc_tag.get('content', '') if desc_tag else ''
            
            match = re.search(r'has\s+([\d,\.]+)\s+Instagram\s+followers', content, re.IGNORECASE)
            if match:
                return clean_count_str(match.group(1))
                
            # Backup raw text search on HTML
            match_raw = re.search(r'has\s+([\d,\.]+)\s+Instagram\s+followers', response.text, re.IGNORECASE)
            if match_raw:
                return clean_count_str(match_raw.group(1))
    except Exception as e:
        print(f"Instastatistics exact count fetch failed for {handle}: {e}. Falling back to direct Instagram scrape.")
        
    # 2. Fallback to direct Instagram scraping (may return truncated count e.g. 65K)
    url = f"https://www.instagram.com/{handle}/"
    
    # Introduce staggered start to spread concurrent requests
    time.sleep(random.uniform(0.5, 2.5))
    
    for attempt in range(3):
        try:
            response = requests.get(url, headers=GOOGLEBOT_HEADERS, timeout=15)
            if response.status_code != 200:
                time.sleep(2)
                continue
                
            soup = BeautifulSoup(response.text, 'html.parser')
            desc_tag = soup.find('meta', attrs={'name': 'description'}) or soup.find('meta', attrs={'property': 'og:description'})
            if not desc_tag or not desc_tag.get('content'):
                time.sleep(2)
                continue
                
            content = desc_tag['content']
            match = re.search(r'([\d\.,]+[MK]?)\s+Followers', content, re.IGNORECASE)
            if not match:
                # If we got the login screen redirect page
                time.sleep(2.5)
                continue
                
            return clean_count_str(match.group(1))
        except Exception as e:
            if attempt == 2:
                raise e
            time.sleep(2)
            
    raise ValueError("Instagram rate limit active (returned sign-in page) after 3 attempts")

def scrape_facebook(page_name: str) -> int:
    """
    Scrapes the public likes/followers count of a Facebook page using Googlebot User-Agent.
    """
    url = f"https://www.facebook.com/{page_name}"
    
    # Stagger requests
    time.sleep(random.uniform(0.2, 1.2))
    
    response = requests.get(url, headers=GOOGLEBOT_HEADERS, timeout=15)
    if response.status_code != 200:
        raise ValueError(f"Facebook returned status code {response.status_code}")
        
    soup = BeautifulSoup(response.text, 'html.parser')
    desc_tag = soup.find('meta', attrs={'name': 'description'}) or soup.find('meta', attrs={'property': 'og:description'})
    if not desc_tag or not desc_tag.get('content'):
        raise ValueError("Could not find meta description tag for Facebook")
        
    content = desc_tag['content']
    match = re.search(r'([\d\.,]+[MK]?)\s+likes', content, re.IGNORECASE)
    if not match:
        match = re.search(r'([\d\.,]+[MK]?)\s+followers', content, re.IGNORECASE)
        
    if not match:
        raise ValueError(f"Likes or followers pattern not found in meta description: '{content}'")
        
    return clean_count_str(match.group(1))

def scrape_x_and_avatar(handle: str) -> tuple:
    """
    Scrapes public follower count and high-res profile image URL of an X (Twitter) profile.
    """
    url = f"https://x.com/{handle}"
    
    # Stagger requests
    time.sleep(random.uniform(0.2, 1.2))
    
    response = requests.get(url, headers=CHROME_HEADERS, timeout=15)
    if response.status_code != 200:
        raise ValueError(f"X returned status code {response.status_code}")
        
    matches = re.findall(r'\"followers\"[^\d]*(\d+)', response.text) or re.findall(r'followers:(\d+)', response.text)
    if not matches:
        raise ValueError("Follower count not found in X page source")
    followers = int(matches[0])
    
    avatar_url = ""
    soup = BeautifulSoup(response.text, 'html.parser')
    og_image_tag = soup.find('meta', property='og:image')
    if og_image_tag and og_image_tag.get('content'):
        avatar_url = og_image_tag['content']
        suffix_pattern = r'_(?:normal|bigger|mini|reasonably_small|x96|\d+x\d+)(\.[a-zA-Z0-9]+)$'
        if re.search(suffix_pattern, avatar_url):
            avatar_url = re.sub(suffix_pattern, r'_400x400\1', avatar_url)
            
    return followers, avatar_url

def scrape_x(handle: str) -> int:
    """
    Scrapes the public follower count of an X (Twitter) profile.
    """
    followers, _ = scrape_x_and_avatar(handle)
    return followers

def scrape_tiktok(handle: str, browser=None) -> int:
    """
    Scrapes the public follower count of a TikTok profile using Playwright.
    Reuses browser context if a shared browser instance is provided.
    """
    from playwright.sync_api import sync_playwright
    url = f"https://www.tiktok.com/@{handle}"
    
    local_browser = False
    playwright_context = None
    if browser is None:
        playwright_context = sync_playwright().start()
        browser = playwright_context.chromium.launch(headless=True)
        local_browser = True
        
    try:
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800}
        )
        page = context.new_page()
        try:
            response = page.goto(url, wait_until="domcontentloaded", timeout=30000)
            if response and response.status != 200:
                raise ValueError(f"TikTok returned status code {response.status}")
                
            page.wait_for_timeout(3000) # Let Javascript execute
            
            html = page.content()
            
            # 1. Try to find exact count in statsV2 first (for high precision)
            match_exact = re.search(r'\"statsV2\":\s*\{[^}]*\"followerCount\":\s*\"(\d+)\"', html)
            if match_exact:
                return int(match_exact.group(1))
                
            # 2. Try broad search in statsV2
            match_broad = re.search(r'\"statsV2\":\s*\{.*?\"followerCount\":\s*\"(\d+)\"', html)
            if match_broad:
                return int(match_broad.group(1))
                
            # 3. Fallback to legacy followersCount
            match_legacy = re.search(r'\"followersCount\":\s*(\d+)', html)
            if match_legacy:
                return int(match_legacy.group(1))
                
            # 4. Fallback to UI element innerText
            el = page.query_selector('[data-e2e="followers-count"]')
            if el:
                count_str = el.inner_text().strip()
                return clean_count_str(count_str)
                
            raise ValueError("Could not locate followers count on TikTok page")
        finally:
            context.close()
    finally:
        if local_browser:
            browser.close()
            if playwright_context:
                playwright_context.stop()

# ========================================================
# Concurrent Scraping Task Worker
# ========================================================
def scrape_idol_http_channels(idol, today_backups, target_platform=None):
    """
    Scrapes X, Instagram, and Facebook metrics concurrently.
    Includes failure fallback logic from today_backups.
    Returns: (name, results, alerts, truly_failed)
    truly_failed contains (name, platform) pairs where scraping failed AND no backup existed.
    """
    name = idol.get("name")
    results = []
    alerts = []
    truly_failed = []  # Only channels with NO backup and failed scrape
    
    # 1. Instagram
    ig = idol.get("instagram_handle")
    if ig and (target_platform is None or target_platform.lower() == "instagram"):
        backup_val = today_backups.get((name, "Instagram"))
        try:
            count = scrape_instagram(ig)
            if count == 0 and backup_val is not None:
                print(f"Scraped 0 for {name} (Instagram), using backup: {backup_val}")
                count = backup_val
            results.append(("Instagram", ig, count))
        except Exception as e:
            err_msg = str(e)
            alerts.append(f"Instagram Scrape Error for {name} ({ig}): {err_msg}")
            if backup_val is not None:
                # Graceful degradation: backup used, NOT a true failure
                print(f"Scrape failed for {name} (Instagram), using backup count: {backup_val}")
                results.append(("Instagram", ig, backup_val))
            else:
                # True failure: no backup available, needs retry
                truly_failed.append((name, "Instagram"))
                if "429" in err_msg or "blocked" in err_msg.lower():
                    alerts.append(f"::warning:: Blocked by Instagram while scraping {name} ({ig})")
                
    # 2. X (Twitter)
    x = idol.get("x_handle")
    if x and (target_platform is None or target_platform.lower() == "x"):
        backup_val = today_backups.get((name, "X"))
        try:
            count, avatar_url = scrape_x_and_avatar(x)
            if count == 0 and backup_val is not None:
                print(f"Scraped 0 for {name} (X), using backup: {backup_val}")
                count = backup_val
            results.append(("X", x, count))
            if avatar_url:
                idol["x_avatar_url"] = avatar_url
        except Exception as e:
            err_msg = str(e)
            alerts.append(f"X Scrape Error for {name} ({x}): {err_msg}")
            if backup_val is not None:
                print(f"Scrape failed for {name} (X), using backup count: {backup_val}")
                results.append(("X", x, backup_val))
            else:
                truly_failed.append((name, "X"))
                if "429" in err_msg or "blocked" in err_msg.lower():
                    alerts.append(f"::warning:: Blocked by X while scraping {name} ({x})")
                if "404" in err_msg or "suspended" in err_msg.lower():
                    alerts.append(f"::error:: X account for {name} ({x}) not found or suspended!")
                
    # 3. Facebook
    fb = idol.get("facebook_page")
    if fb and (target_platform is None or target_platform.lower() == "facebook"):
        backup_val = today_backups.get((name, "Facebook"))
        try:
            count = scrape_facebook(fb)
            if count == 0 and backup_val is not None:
                print(f"Scraped 0 for {name} (Facebook), using backup: {backup_val}")
                count = backup_val
            results.append(("Facebook", fb, count))
        except Exception as e:
            err_msg = str(e)
            alerts.append(f"Facebook Scrape Error for {name} ({fb}): {err_msg}")
            if backup_val is not None:
                print(f"Scrape failed for {name} (Facebook), using backup count: {backup_val}")
                results.append(("Facebook", fb, backup_val))
            else:
                truly_failed.append((name, "Facebook"))
                if "429" in err_msg or "blocked" in err_msg.lower():
                    alerts.append(f"::warning:: Blocked by Facebook while scraping {name} ({fb})")
                
    return name, results, alerts, truly_failed

# ========================================================
# Backup Retrieval Pipelines (Database & CSV)
# ========================================================
def get_today_backup_postgres(url, today_str):
    print("Fetching today's database records as backups...")
    import psycopg2
    import psycopg2.extras
    backups = {}
    try:
        conn = psycopg2.connect(url)
        cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cursor.execute("""
            SELECT idol_name, platform, follower_count 
            FROM follower_history 
            WHERE date = %s;
        """, (today_str,))
        rows = cursor.fetchall()
        for r in rows:
            backups[(r['idol_name'], r['platform'])] = r['follower_count']
        cursor.close()
        conn.close()
        print(f"Loaded {len(backups)} database backups for {today_str}.")
    except Exception as e:
        print(f"Warning: Could not fetch today's database backups: {e}")
    return backups

def get_today_backup_csv(csv_path, today_str):
    backups = {}
    if not os.path.exists(csv_path):
        return backups
    print("Fetching today's CSV records as backups...")
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            next(reader) # skip headers
            for r in reader:
                if len(r) == 6 and r[0] == today_str:
                    try:
                        backups[(r[2], r[3])] = int(r[5])
                    except ValueError:
                        pass
        print(f"Loaded {len(backups)} CSV backups for {today_str}.")
    except Exception as e:
        print(f"Warning: Could not fetch today's CSV backups: {e}")
    return backups

# ========================================================
# PostgreSQL Data Saving & Synthesis Pipelines
# ========================================================
def save_results_to_postgres(results, url):
    print("Connecting to PostgreSQL database to save results...")
    import psycopg2
    conn = psycopg2.connect(url)
    cursor = conn.cursor()
    for r in results:
        # r is: (today_str, now_time_str, name, platform, username, count)
        ts = r[1] if r[1] else None
        cursor.execute("""
            INSERT INTO follower_history (date, timestamp, idol_name, platform, username, follower_count)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (date, idol_name, platform) DO UPDATE
            SET username = EXCLUDED.username, follower_count = EXCLUDED.follower_count, timestamp = EXCLUDED.timestamp;
        """, (r[0], ts, r[2], r[3], r[4], int(r[5])))
    conn.commit()
    cursor.close()
    conn.close()
    print("Successfully updated follower history in SQL database.")

def synthesize_missing_data_postgres(url):
    print("Connecting to PostgreSQL database to run data synthesis...")
    import psycopg2
    import psycopg2.extras
    import random
    
    conn = psycopg2.connect(url)
    cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    
    cursor.execute("SELECT DISTINCT date FROM follower_history ORDER BY date ASC;")
    dates = [row['date'] for row in cursor.fetchall()]
    if len(dates) < 2:
        cursor.close()
        conn.close()
        return
        
    today = dates[-1]
    previous_day = dates[-2]
    
    cursor.execute("""
        SELECT date, timestamp, idol_name, platform, username, follower_count 
        FROM follower_history 
        WHERE date IN (%s, %s);
    """, (today, previous_day))
    rows = cursor.fetchall()
    
    cursor.execute("""
        SELECT DISTINCT idol_name, platform, username
        FROM follower_history;
    """)
    channels = cursor.fetchall()
    
    synthesized_count = 0
    adjusted_count = 0
    
    for ch in channels:
        idol_name = ch['idol_name']
        platform = ch['platform']
        username = ch['username']
        
        today_rec = next((r for r in rows if r['date'] == today and r['idol_name'] == idol_name and r['platform'] == platform), None)
        prev_rec = next((r for r in rows if r['date'] == previous_day and r['idol_name'] == idol_name and r['platform'] == platform), None)
        
        # Rule 2: If yesterday is missing, synthesize yesterday = today - random(1..5)
        if today_rec and today_rec['follower_count'] and (not prev_rec or not prev_rec['follower_count']):
            today_val = today_rec['follower_count']
            synth_val = today_val - random.randint(1, 5)
            
            cursor.execute("""
                INSERT INTO follower_history (date, timestamp, idol_name, platform, username, follower_count)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (date, idol_name, platform) DO UPDATE
                SET follower_count = EXCLUDED.follower_count, timestamp = EXCLUDED.timestamp;
            """, (previous_day, '12:00:00', idol_name, platform, username, synth_val))
            print(f"Synthesized missing count for {idol_name} ({platform}) on {previous_day}: {synth_val}")
            synthesized_count += 1
            prev_rec = {'date': previous_day, 'follower_count': synth_val}
            
        # Rule 1: If today is less than yesterday, adjust today = yesterday + random(1..5)
        if today_rec and prev_rec and today_rec['follower_count'] and prev_rec['follower_count']:
            today_val = today_rec['follower_count']
            prev_val = prev_rec['follower_count']
            
            if today_val < prev_val:
                adjusted_val = prev_val + random.randint(1, 5)
                cursor.execute("""
                    UPDATE follower_history 
                    SET follower_count = %s
                    WHERE date = %s AND idol_name = %s AND platform = %s;
                """, (adjusted_val, today, idol_name, platform))
                print(f"Adjusted data drop for {idol_name} ({platform}) on {today}: {today_val} -> {adjusted_val}")
                adjusted_count += 1
                
    conn.commit()
    cursor.close()
    conn.close()
    print(f"Data synthesis complete. Synthesized: {synthesized_count}, Adjusted: {adjusted_count}")

# ========================================================
# Local CSV Data Saving & Synthesis Fallback Pipelines
# ========================================================
def synthesize_missing_data(csv_path):
    if not os.path.exists(csv_path):
        return
    
    rows = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        headers = next(reader)
        for row in reader:
            rows.append(row)
            
    dates = sorted(list(set(r[0] for r in rows)))
    if len(dates) < 3:
        return
        
    today = dates[-1]
    previous_day = dates[-2]
    keys = set((r[2], r[3]) for r in rows)
    
    synthesized_count = 0
    new_synthesized_rows = []
    
    for idol_name, platform in keys:
        prev_record = next((r for r in rows if r[0] == previous_day and r[2] == idol_name and r[3] == platform), None)
        
        if not prev_record or not prev_record[5] or int(prev_record[5]) == 0:
            current_record = next((r for r in rows if r[0] == today and r[2] == idol_name and r[3] == platform), None)
            
            if current_record and current_record[5] and int(current_record[5]) > 0:
                current_val = int(current_record[5])
                username = current_record[4]
                
                older_records = [r for r in rows if r[0] < previous_day and r[2] == idol_name and r[3] == platform]
                older_records.sort(key=lambda x: x[0], reverse=True)
                
                if older_records:
                    prev_available_rec = older_records[0]
                    prev_val = int(prev_available_rec[5])
                    
                    if prev_val > 0:
                        synth_val = int((prev_val + current_val) / 2)
                        if prev_record:
                            prev_record[5] = str(synth_val)
                            prev_record[1] = "12:00:00"
                        else:
                            new_synthesized_rows.append([previous_day, "12:00:00", idol_name, platform, username, str(synth_val)])
                        print(f"Synthesized missing count for {idol_name} ({platform}) on {previous_day}: {synth_val}")
                        synthesized_count += 1
                        
    if new_synthesized_rows:
        rows.extend(new_synthesized_rows)
        
    if synthesized_count > 0:
        rows.sort(key=lambda x: (x[0], x[2], x[3]))
        with open(csv_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(headers)
            writer.writerows(rows)
        print(f"\nSuccessfully synthesized {synthesized_count} missing records in '{csv_path}'.")

# ========================================================
# Main Execution Loop
# ========================================================
def run_scraper(config_path: str, output_path: str, target_platform: str = None, failed_file: str = None):
    db_sync_status = "Skipped (Fallback to CSV)"
    db_sync_error = None
    if not os.path.exists(config_path):
        print(f"Error: Configuration file '{config_path}' not found.")
        return
        
    with open(config_path, 'r', encoding='utf-8') as f:
        idols = json.load(f)
        
    active_idols = [i for i in idols if i.get("active") is not False]
    
    # Filter active_idols to only those failed channels if failed_file is provided
    failed_list = []
    if failed_file and os.path.exists(failed_file):
        try:
            with open(failed_file, 'r', encoding='utf-8') as f:
                failed_list = json.load(f) # List of [name, platform]
            print(f"Filtering run to retry {len(failed_list)} failed channels from '{failed_file}'...")
        except Exception as e:
            print(f"Error reading failed file '{failed_file}': {e}")
            
    if failed_list:
        failed_map = {}
        for name, platform in failed_list:
            failed_map.setdefault(name.lower(), set()).add(platform.lower())
            
        filtered_idols = []
        for idol in active_idols:
            name_lower = idol.get("name", "").lower()
            if name_lower in failed_map:
                # Copy idol to avoid mutating configuration file on disk
                idol_copy = dict(idol)
                platforms = failed_map[name_lower]
                
                # Keep only platforms listed in the failed list
                if "instagram" not in platforms: idol_copy["instagram_handle"] = None
                if "x" not in platforms: idol_copy["x_handle"] = None
                if "facebook" not in platforms: idol_copy["facebook_page"] = None
                if "tiktok" not in platforms: idol_copy["tiktok_handle"] = None
                
                filtered_idols.append(idol_copy)
        active_idols = filtered_idols
        print(f"Retrying scraping for {len(active_idols)} profiles matching failed platforms.")
    else:
        print(f"Loaded {len(active_idols)} active profiles to scrape...")
    if target_platform:
        print(f"Limiting scraping to platform: {target_platform}")
        
    TZ_BKK = timezone(timedelta(hours=7))
    now_bkk = datetime.now(TZ_BKK)
    today_str = now_bkk.strftime('%Y-%m-%d')
    now_time_str = now_bkk.strftime('%H:%M:%S')
    results = []
    all_alerts = []
    
    # Load today's backups
    postgres_url = os.environ.get("POSTGRES_URL")
    if not postgres_url:
        print("WARNING: POSTGRES_URL environment variable is NOT set.")
        if os.environ.get("GITHUB_ACTIONS") == "true":
            print("::error::POSTGRES_URL secret is NOT configured in GitHub Repository Secrets. Follower data cannot be saved to PostgreSQL!")
            print("=========================================================================")
            print("To fix this:")
            print("1. Go to your GitHub repository: Settings -> Secrets and variables -> Actions")
            print("2. Click 'New repository secret'")
            print("3. Name: POSTGRES_URL")
            print("4. Value: <your_neon_postgresql_connection_string>")
            print("=========================================================================")
            
    if postgres_url:
        today_backups = get_today_backup_postgres(postgres_url, today_str)
    else:
        today_backups = get_today_backup_csv(output_path, today_str)
        
    # 1. Run HTTP platforms scrape concurrently (if applicable)
    run_http = target_platform is None or target_platform.lower() in ("x", "instagram", "facebook")
    http_truly_failed = []  # Channels with no backup and failed scrape
    if run_http:
        print("\nRunning X, Instagram, and Facebook scrapers concurrently...")
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = {executor.submit(scrape_idol_http_channels, idol, today_backups, target_platform): idol for idol in active_idols}
            for future in as_completed(futures):
                idol_name, local_res, alerts, truly_failed_channels = future.result()
                all_alerts.extend(alerts)
                http_truly_failed.extend(truly_failed_channels)
                for res in local_res:
                    results.append((today_str, now_time_str, idol_name, res[0], res[1], res[2]))
                
    # 2. Run TikTok sequentially (using Playwright)
    run_tiktok = (target_platform is None or target_platform.lower() == "tiktok") and any(idol.get("tiktok_handle") for idol in active_idols)
    if run_tiktok:
        print("\nStarting Playwright for TikTok profiles scraping...")
        browser_instance = None
        playwright_context = None
        try:
            from playwright.sync_api import sync_playwright
            playwright_context = sync_playwright().start()
            browser_instance = playwright_context.chromium.launch(headless=True)
            
            for idol in active_idols:
                name = idol.get("name")
                tiktok_handle = idol.get("tiktok_handle")
                if tiktok_handle:
                    backup_val = today_backups.get((name, "TikTok"))
                    print(f"  TikTok ({tiktok_handle})...")
                    try:
                        followers = scrape_tiktok(tiktok_handle, browser=browser_instance)
                        if followers == 0 and backup_val is not None:
                            print(f"Scraped 0 for {name} (TikTok), using backup: {backup_val}")
                            followers = backup_val
                        results.append((today_str, now_time_str, name, "TikTok", tiktok_handle, followers))
                    except Exception as e:
                        err_msg = str(e)
                        all_alerts.append(f"TikTok Scrape Error for {name} ({tiktok_handle}): {err_msg}")
                        if backup_val is not None:
                            print(f"Scrape failed for {name} (TikTok), using backup count: {backup_val}")
                            results.append((today_str, now_time_str, name, "TikTok", tiktok_handle, backup_val))
                        else:
                            if "429" in err_msg or "blocked" in err_msg.lower():
                                all_alerts.append(f"::warning:: Blocked by TikTok while scraping {name} ({tiktok_handle})")
        except Exception as e:
            all_alerts.append(f"Playwright initialization error: {e}")
        finally:
            if browser_instance:
                browser_instance.close()
            if playwright_context:
                playwright_context.stop()
                
    if all_alerts:
        print("\n=== Scraping Alerts & Errors ===")
        for alert in all_alerts:
            print(alert)
        with open("alerts.log", "w", encoding="utf-8") as af:
            af.write("\n".join(all_alerts) + "\n")
            
    if not results:
        print("\nNo results scraped. Exiting.")
        return
        
    if postgres_url:
        try:
            save_results_to_postgres(results, postgres_url)
            db_sync_status = "Success"
        except Exception as e:
            print(f"Error saving stats to PostgreSQL: {e}")
            db_sync_status = f"Failed ({e})"
            db_sync_error = e
    else:
        # Fallback to local CSV
        existing_rows = []
        headers = ["Date", "Timestamp", "Idol_Name", "Platform", "Username", "Follower_Count"]
        
        if os.path.exists(output_path):
            try:
                with open(output_path, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                    if lines:
                        headers = [h.strip() for h in lines[0].split(',')]
                        if "Timestamp" not in headers:
                            headers.insert(1, "Timestamp")
                        
                        for line in lines[1:]:
                            parts = line.strip().split(',')
                            if len(parts) == 5:
                                parts.insert(1, "")
                            if len(parts) == 6:
                                existing_rows.append(parts)
            except Exception as e:
                print(f"Error reading existing CSV: {e}")
                
        keys_to_update = {(r[0], r[2], r[3]) for r in results}
        updated_rows = [row for row in existing_rows if (row[0], row[2], row[3]) not in keys_to_update]
        
        for r in results:
            updated_rows.append([r[0], r[1], r[2], r[3], r[4], str(r[5])])
            
        updated_rows.sort(key=lambda x: (x[0], x[2], x[3]))
        
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(','.join(headers) + '\n')
                for row in updated_rows:
                    f.write(','.join(row) + '\n')
            print(f"\nSuccessfully updated follower history CSV. Total records: {len(updated_rows)}")
        except Exception as e:
            print(f"Error writing CSV: {e}")
        
    try:
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(idols, f, indent=2)
        print(f"Successfully saved idols config updates inside '{config_path}'")
    except Exception as e:
        print(f"Error saving idols configuration: {e}")

    failed_channels = []
    # Compile truly failed channels (no backup, no data written)
    # Channels that used backup counts are NOT failures - they have valid data in DB
    try:
        # HTTP platforms: use the truly_failed list from scrape_idol_http_channels
        failed_channels.extend(http_truly_failed)

        # TikTok: channels that failed AND had no backup
        for alert in all_alerts:
            if "Playwright initialization error" in alert:
                # Entire TikTok runner crashed - find which channels have no DB record
                for idol in active_idols:
                    name = idol.get("name")
                    tiktok_handle = idol.get("tiktok_handle")
                    if tiktok_handle and (target_platform is None or target_platform.lower() == "tiktok"):
                        if today_backups.get((name, "TikTok")) is None:
                            failed_channels.append((name, "TikTok"))
            elif "TikTok Scrape Error for" in alert:
                # Individual TikTok failure with no backup
                name_part = alert.split("TikTok Scrape Error for ")[1].split(" (")[0].strip()
                if today_backups.get((name_part, "TikTok")) is None:
                    failed_channels.append((name_part, "TikTok"))

        # Remove duplicates
        failed_channels = sorted(list(set(failed_channels)))
        if failed_channels:
            print(f"True failures (no backup): {len(failed_channels)} channels")
        else:
            print("All channels either scraped successfully or used today's backup. No true failures.")
    except Exception as le:
        print(f"Error compiling failed channels: {le}")

    # Write failed channels to dynamic file based on platform, otherwise clear/delete the file
    failed_scrapes_path = f"failed_scrapes_{target_platform.lower()}.json" if target_platform else "failed_scrapes.json"
    if failed_channels:
        try:
            with open(failed_scrapes_path, "w", encoding="utf-8") as f:
                json.dump(failed_channels, f, indent=2)
            print(f"Logged {len(failed_channels)} failed channels to '{failed_scrapes_path}' for retry.")
        except Exception as e:
            print(f"Error logging failed channels: {e}")
    else:
        if os.path.exists(failed_scrapes_path):
            try:
                os.remove(failed_scrapes_path)
                print(f"No failed channels. Cleared '{failed_scrapes_path}'.")
            except Exception as e:
                print(f"Error removing failed scrapes file: {e}")

    if db_sync_error:
        raise db_sync_error

    if failed_channels:
        raise ValueError(f"Scrape completed with {len(failed_channels)} failed channels.")

def send_consolidated_alert(phase: str, config_path: str = "idols.json"):
    TZ_BKK = timezone(timedelta(hours=7))
    today_str = datetime.now(TZ_BKK).strftime('%Y-%m-%d')
    
    if not os.path.exists(config_path):
        print(f"Error: Config '{config_path}' not found for alert.")
        return
        
    with open(config_path, 'r', encoding='utf-8') as f:
        idols = json.load(f)
    active_idols = [i for i in idols if i.get("active") is not False]
    
    expected_channels = []
    for idol in active_idols:
        name = idol.get("name")
        if idol.get("x_handle"): expected_channels.append((name, "X"))
        if idol.get("instagram_handle"): expected_channels.append((name, "Instagram"))
        if idol.get("facebook_page"): expected_channels.append((name, "Facebook"))
        if idol.get("tiktok_handle"): expected_channels.append((name, "TikTok"))
        
    # Load today's backups from database or CSV to determine actual successes
    postgres_url = os.environ.get("POSTGRES_URL")
    if postgres_url:
        backups = get_today_backup_postgres(postgres_url, today_str)
    else:
        backups = get_today_backup_csv("follower_history.csv", today_str)
        
    backups_normalized = {(name.lower(), plat.lower()) for (name, plat) in backups.keys()}
    
    # Count expected, success, and failed by platform
    platform_expected = {"Instagram": 0, "X": 0, "Facebook": 0, "TikTok": 0}
    platform_success = {"Instagram": 0, "X": 0, "Facebook": 0, "TikTok": 0}
    platform_failed = {"Instagram": 0, "X": 0, "Facebook": 0, "TikTok": 0}
    failed_channels_unique = []
    
    def normalize_plat(p):
        p_lower = p.lower()
        if p_lower == "x": return "X"
        if p_lower == "instagram": return "Instagram"
        if p_lower == "facebook": return "Facebook"
        if p_lower == "tiktok": return "TikTok"
        return p.title()
        
    for name, plat in expected_channels:
        plat_key = normalize_plat(plat)
        if plat_key in platform_expected:
            platform_expected[plat_key] += 1
            
        if (name.lower(), plat.lower()) in backups_normalized:
            platform_success[plat_key] += 1
        else:
            platform_failed[plat_key] += 1
            failed_channels_unique.append((name, plat_key))
            
    total_expected = len(expected_channels)
    total_success = sum(platform_success.values())
    total_failed = sum(platform_failed.values())
    
    status_emoji = "✅" if total_failed == 0 else "⚠️"
    phase_title = "Primary Scrape Summary" if phase == "initial" else "Final Daily Run Summary"
    
    msg_lines = [
        f"{status_emoji} *Idol Follower Scraper - {phase_title}*",
        f"Date: {today_str}",
        f"Status: {'Success' if total_failed == 0 else 'Completed with Warnings'}",
        f"Total Expected Channels: {total_expected} (IG: {platform_expected['Instagram']}, X: {platform_expected['X']}, FB: {platform_expected['Facebook']}, TT: {platform_expected['TikTok']})",
        f"Successfully Scraped: {total_success} (IG: {platform_success['Instagram']}, X: {platform_success['X']}, FB: {platform_success['Facebook']}, TT: {platform_success['TikTok']})",
        f"Failed/Missing: {total_failed} (IG: {platform_failed['Instagram']}, X: {platform_failed['X']}, FB: {platform_failed['Facebook']}, TT: {platform_failed['TikTok']})"
    ]
    
    if total_failed > 0:
        msg_lines.append("\n*Missing/Failed Accounts:*")
        for name, platform in failed_channels_unique:
            msg_lines.append(f"• {name} ({platform})")
            
    lark_webhook = "https://open.larksuite.com/open-apis/bot/v2/hook/a870d338-0431-4d97-ac37-e022e16a3c46"
    import requests
    payload = {
        "msg_type": "text",
        "content": {
            "text": "\n".join(msg_lines)
        }
    }
    try:
        res = requests.post(lark_webhook, json=payload, headers={"Content-Type": "application/json"}, timeout=10)
        print(f"Consolidated Lark notification ({phase}) sent. Status: {res.status_code}")
    except Exception as le:
        print(f"Error sending consolidated Lark notification: {le}")

def test_single_idol(name: str, config_path: str):
    if not os.path.exists(config_path):
        print(f"Error: Configuration file '{config_path}' not found.")
        return
        
    with open(config_path, 'r', encoding='utf-8') as f:
        idols = json.load(f)
        
    idol = next((i for i in idols if i.get("name").lower() == name.lower()), None)
    if not idol:
        print(f"Error: Idol '{name}' not found in configuration.")
        return
        
    print(f"Testing scraping for '{idol.get('name')}'...")
    
    ig = idol.get("instagram_handle")
    if ig:
        try:
            print("Instagram Followers:", f"{scrape_instagram(ig):,}")
        except Exception as e:
            print("Instagram Error:", e)
            
    x = idol.get("x_handle")
    if x:
        try:
            print("X Followers:", f"{scrape_x(x):,}")
        except Exception as e:
            print("X Error:", e)
            
    fb = idol.get("facebook_page")
    if fb:
        try:
            print("Facebook Likes/Followers:", f"{scrape_facebook(fb):,}")
        except Exception as e:
            print("Facebook Error:", e)

    tiktok = idol.get("tiktok_handle")
    if tiktok:
        try:
            print("TikTok Followers:", f"{scrape_tiktok(tiktok):,}")
        except Exception as e:
            print("TikTok Error:", e)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Monitor and log public follower counts of idols across X, Instagram, Facebook, and TikTok.")
    parser.add_argument("--run", action="store_true", help="Run the full scraping pipeline and update the CSV.")
    parser.add_argument("--platform", default=None, help="Scrape only a specific platform (e.g. TikTok, X, Instagram, Facebook).")
    parser.add_argument("--test", type=str, help="Test scraping a single idol by name from the config (e.g. --test Ame).")
    parser.add_argument("--config", default="idols.json", help="Path to configuration JSON file (default: idols.json).")
    parser.add_argument("--output", default="follower_history.csv", help="Path to follower history CSV file (default: follower_history.csv).")
    parser.add_argument("--failed-file", default=None, help="JSON file containing list of failed channels to retry.")
    parser.add_argument("--synthesize-only", action="store_true", help="Only run PostgreSQL database data synthesis.")
    parser.add_argument("--send-alert", choices=["initial", "final"], help="Send a consolidated Lark notification for the specified phase.")
    
    args = parser.parse_args()
    
    if args.send_alert:
        send_consolidated_alert(args.send_alert, args.config)
    elif args.synthesize_only:
        postgres_url = os.environ.get("POSTGRES_URL")
        if postgres_url:
            synthesize_missing_data_postgres(postgres_url)
        else:
            print("Error: POSTGRES_URL not configured.")
            sys.exit(1)
    elif args.run:
        run_scraper(args.config, args.output, args.platform, args.failed_file)
    elif args.test:
        test_single_idol(args.test, args.config)
    else:
        parser.print_help()
