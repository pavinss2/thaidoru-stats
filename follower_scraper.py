import os
import re
import json
import csv
import argparse
from datetime import datetime
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
    Scrapes the public follower count of an Instagram profile using Googlebot User-Agent.
    """
    url = f"https://www.instagram.com/{handle}/"
    response = requests.get(url, headers=GOOGLEBOT_HEADERS, timeout=15)
    if response.status_code != 200:
        raise ValueError(f"Instagram returned status code {response.status_code}")
        
    soup = BeautifulSoup(response.text, 'html.parser')
    desc_tag = soup.find('meta', attrs={'name': 'description'}) or soup.find('meta', attrs={'property': 'og:description'})
    if not desc_tag or not desc_tag.get('content'):
        raise ValueError("Could not find meta description tag for Instagram")
        
    content = desc_tag['content']
    match = re.search(r'([\d\.,]+[MK]?)\s+Followers', content, re.IGNORECASE)
    if not match:
        raise ValueError(f"Followers pattern not found in meta description: '{content}'")
        
    return clean_count_str(match.group(1))

def scrape_facebook(page_name: str) -> int:
    """
    Scrapes the public likes/followers count of a Facebook page using Googlebot User-Agent.
    """
    url = f"https://www.facebook.com/{page_name}"
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
            
            el = page.query_selector('[data-e2e="followers-count"]')
            if not el:
                html = page.content()
                match = re.search(r'\"followersCount\":(\d+)', html)
                if match:
                    return int(match.group(1))
                raise ValueError("Could not locate followers count element on TikTok page")
                
            count_str = el.inner_text().strip()
            return clean_count_str(count_str)
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
    """
    name = idol.get("name")
    results = []
    alerts = []
    
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
                print(f"Scrape failed for {name} (Instagram), using backup count: {backup_val}")
                results.append(("Instagram", ig, backup_val))
            else:
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
                if "429" in err_msg or "blocked" in err_msg.lower():
                    alerts.append(f"::warning:: Blocked by Facebook while scraping {name} ({fb})")
                
    return name, results, alerts

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
                      # Rows: Date, Timestamp, Idol_Name, Platform, Username, Follower_Count
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
    print("Connecting to PostgreSQL database to run linear data synthesis...")
    import psycopg2
    import psycopg2.extras
    conn = psycopg2.connect(url)
    cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    
    cursor.execute("SELECT DISTINCT date FROM follower_history ORDER BY date ASC;")
    dates = [row['date'] for row in cursor.fetchall()]
    if len(dates) < 3:
        cursor.close()
        conn.close()
        return
        
    today = dates[-1]
    previous_day = dates[-2]
    
    cursor.execute("""
        SELECT date, timestamp, idol_name, platform, username, follower_count 
        FROM follower_history 
        WHERE date IN (%s, %s) OR date < %s;
    """, (today, previous_day, previous_day))
    rows = cursor.fetchall()
    
    keys = set((r['idol_name'], r['platform']) for r in rows)
    synthesized_count = 0
    
    for idol_name, platform in keys:
        prev_record = next((r for r in rows if r['date'] == previous_day and r['idol_name'] == idol_name and r['platform'] == platform), None)
        
        if not prev_record or not prev_record['follower_count'] or prev_record['follower_count'] == 0:
            current_record = next((r for r in rows if r['date'] == today and r['idol_name'] == idol_name and r['platform'] == platform), None)
            
            if current_record and current_record['follower_count'] and current_record['follower_count'] > 0:
                current_val = current_record['follower_count']
                username = current_record['username']
                
                older_records = [r for r in rows if r['date'] < previous_day and r['idol_name'] == idol_name and r['platform'] == platform]
                older_records.sort(key=lambda x: x['date'], reverse=True)
                
                if older_records:
                    prev_available_rec = older_records[0]
                    prev_val = prev_available_rec['follower_count']
                    
                    if prev_val > 0:
                        synth_val = int((prev_val + current_val) / 2)
                        
                        cursor.execute("""
                            INSERT INTO follower_history (date, timestamp, idol_name, platform, username, follower_count)
                            VALUES (%s, %s, %s, %s, %s, %s)
                            ON CONFLICT (date, idol_name, platform) DO UPDATE
                            SET follower_count = EXCLUDED.follower_count, timestamp = EXCLUDED.timestamp;
                        """, (previous_day, '12:00:00', idol_name, platform, username, synth_val))
                        print(f"Synthesized missing count for {idol_name} ({platform}) on {previous_day}: {synth_val}")
                        synthesized_count += 1
                        
    conn.commit()
    cursor.close()
    conn.close()
    if synthesized_count > 0:
        print(f"Successfully synthesized {synthesized_count} missing records in SQL database.")

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
def run_scraper(config_path: str, output_path: str, target_platform: str = None):
    if not os.path.exists(config_path):
        print(f"Error: Configuration file '{config_path}' not found.")
        return
        
    with open(config_path, 'r', encoding='utf-8') as f:
        idols = json.load(f)
        
    active_idols = [i for i in idols if i.get("active") is not False]
    print(f"Loaded {len(active_idols)} active profiles to scrape...")
    if target_platform:
        print(f"Limiting scraping to platform: {target_platform}")
        
    today_str = datetime.today().strftime('%Y-%m-%d')
    now_time_str = datetime.today().strftime('%H:%M:%S')
    results = []
    all_alerts = []
    
    # Load today's backups
    postgres_url = os.environ.get("POSTGRES_URL")
    if postgres_url:
        today_backups = get_today_backup_postgres(postgres_url, today_str)
    else:
        today_backups = get_today_backup_csv(output_path, today_str)
        
    # 1. Run HTTP platforms scrape concurrently (if applicable)
    run_http = target_platform is None or target_platform.lower() in ("x", "instagram", "facebook")
    if run_http:
        print("\nRunning X, Instagram, and Facebook scrapers concurrently...")
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = {executor.submit(scrape_idol_http_channels, idol, today_backups, target_platform): idol for idol in active_idols}
            for future in as_completed(futures):
                idol_name, local_res, alerts = future.result()
                all_alerts.extend(alerts)
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
            synthesize_missing_data_postgres(postgres_url)
        except Exception as e:
            print(f"Error saving stats to PostgreSQL: {e}")
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
            
        synthesize_missing_data(output_path)
        
    try:
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(idols, f, indent=2)
        print(f"Successfully saved idols config updates inside '{config_path}'")
    except Exception as e:
        print(f"Error saving idols configuration: {e}")

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
    
    args = parser.parse_args()
    
    if args.run:
        run_scraper(args.config, args.output, args.platform)
    elif args.test:
        test_single_idol(args.test, args.config)
    else:
        parser.print_help()
