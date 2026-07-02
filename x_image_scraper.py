import re
import argparse
import os
import json
import requests
from bs4 import BeautifulSoup

def get_x_profile_image_url(profile_url: str) -> str:
    """
    Given an X (Twitter) profile URL or handle, scrape the page and return the direct
    400x400 profile image URL.
    """
    profile_url = profile_url.strip()
    if not profile_url.startswith("http"):
        profile_url = f"https://x.com/{profile_url}"
        
    if "twitter.com" in profile_url:
        profile_url = profile_url.replace("twitter.com", "x.com")
        
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    response = requests.get(profile_url, headers=headers)
    if response.status_code != 200:
        raise ValueError(f"Failed to fetch profile page. Status code: {response.status_code}")
        
    soup = BeautifulSoup(response.text, 'html.parser')
    
    og_image_tag = soup.find('meta', property='og:image')
    if not og_image_tag or not og_image_tag.get('content'):
        raise ValueError("Profile image URL not found in metadata. The account might be private or suspended.")
        
    avatar_url = og_image_tag['content']
    
    suffix_pattern = r'_(?:normal|bigger|mini|reasonably_small|x96|\d+x\d+)(\.[a-zA-Z0-9]+)$'
    if re.search(suffix_pattern, avatar_url):
        avatar_url = re.sub(suffix_pattern, r'_400x400\1', avatar_url)
        
    return avatar_url

def update_idols_json(config_path="idols.json"):
    if not os.path.exists(config_path):
        print(f"Error: Configuration file '{config_path}' not found.")
        return False
        
    with open(config_path, 'r', encoding='utf-8') as f:
        idols = json.load(f)
        
    print(f"Loaded {len(idols)} profiles from {config_path}. Starting X avatar scraping...")
    
    updated_count = 0
    changes_detected = False
    
    for idx, idol in enumerate(idols, 1):
        # Skip if already marked inactive
        if idol.get("active") is False:
            continue
            
        name = idol.get("name")
        x_handle = idol.get("x_handle")
        if x_handle:
            print(f"[{idx}/{len(idols)}] Scraping X avatar for {name} ({x_handle})...")
            try:
                avatar_url = get_x_profile_image_url(x_handle)
                if idol.get("x_avatar_url") != avatar_url:
                    print(f"  Change detected for {name}: {idol.get('x_avatar_url')} -> {avatar_url}")
                    idol["x_avatar_url"] = avatar_url
                    changes_detected = True
                print(f"  Success: {avatar_url}")
                updated_count += 1
            except ValueError as e:
                err_str = str(e)
                print(f"  Error: {err_str}")
                # 404 or Suspended -> mark inactive
                if "404" in err_str or "suspended" in err_str.lower() or "not found" in err_str.lower() or "private" in err_str.lower():
                    print(f"  ALERT: Marking member/group {name} as inactive due to suspended/missing X profile.")
                    idol["active"] = False
                    changes_detected = True
            except Exception as e:
                print(f"  Error: {e}")
                if "x_avatar_url" not in idol:
                    idol["x_avatar_url"] = ""
        else:
            if "x_avatar_url" not in idol:
                idol["x_avatar_url"] = ""
                
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(idols, f, indent=2)
        
    print(f"Finished updating {config_path}. Total avatars updated: {updated_count}")
    return changes_detected

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Get high-resolution profile picture URLs from X profile URLs.")
    parser.add_argument("urls", nargs='*', help="One or more X profile URLs or handles")
    parser.add_argument("-f", "--file", help="Path to a text file containing X profile URLs (one per line)")
    parser.add_argument("--update-config", action="store_true", help="Scrape and update all X avatars directly inside idols.json")
    args = parser.parse_args()
    
    if args.update_config:
        has_changes = update_idols_json()
        print(f"Updates finished. Changes detected: {has_changes}")
        exit(0)
        
    urls_to_process = []
    
    if args.urls:
        urls_to_process.extend(args.urls)
        
    if args.file:
        if not os.path.exists(args.file):
            print(f"Error: File '{args.file}' does not exist.")
            exit(1)
        with open(args.file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    urls_to_process.append(line)
                    
    if not urls_to_process:
        parser.print_help()
        exit(0)
        
    print(f"Processing {len(urls_to_process)} URLs...")
    for url in urls_to_process:
        try:
            img_url = get_x_profile_image_url(url)
            print(f"{url} -> {img_url}")
        except Exception as e:
            print(f"Error processing {url}: {e}")
