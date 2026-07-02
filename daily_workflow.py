import sys
import subprocess
import os

def run_cmd(args):
    print(f"Running command: {' '.join(args)}")
    result = subprocess.run(args, capture_output=True, text=True)
    print(result.stdout)
    if result.stderr:
        print("STDERR:")
        print(result.stderr)
    return result.returncode == 0

def main():
    print("=== STARTING DAILY WORKFLOW ===")
    
    # 1. Run X avatar scraper and update idols.json
    print("\n--- STEP 1: Updating X Avatars ---")
    x_success = run_cmd([sys.executable, "x_image_scraper.py", "--update-config"])
    if not x_success:
        print("Warning: Avatar scraper encountered some errors, proceeding with stats monitoring...")
        
    # 2. Run follower stats scraper
    print("\n--- STEP 2: Running Follower Scraper ---")
    stats_success = run_cmd([sys.executable, "follower_scraper.py", "--run"])
    if not stats_success:
        print("Error: Stats scraper failed!")
        sys.exit(1)
        
    # 3. Read and report alerts if any
    print("\n--- STEP 3: Checking Scraping Alerts ---")
    if os.path.exists("alerts.log"):
        with open("alerts.log", "r", encoding="utf-8") as f:
            alerts = f.read().strip()
        if alerts:
            print("ACTIVE SCRAPING ALERTS FOUND:")
            print(alerts)
            # Create GitHub Action notices dynamically
            for line in alerts.split("\n"):
                if line.startswith("::warning::") or line.startswith("::error::"):
                    print(line)
        else:
            print("No scraping alerts logged.")
    else:
        print("No alerts log found.")
        
    print("\n=== DAILY WORKFLOW COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    main()
