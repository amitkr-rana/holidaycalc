import json
import os
import requests
import sys

def download_airline_logos():
    """
    Reads airlines.json, downloads IATA-based logos if they don't already
    exist, and saves them to a 'logos' folder with a progress bar.
    """
    json_filename = "airlines.json"
    output_folder = "logos"
    # --- MODIFICATION: Updated the base URL to the new source ---
    base_url = "http://airlinelogos.aero/logos/{iata}.svg"
    
    # 1. Create the output folder if it doesn't exist
    try:
        os.makedirs(output_folder, exist_ok=True)
        print(f"📁 Directory '{output_folder}' is ready.")
    except OSError as e:
        print(f"❌ Error creating directory '{output_folder}': {e}")
        return

    # 2. Read the JSON file
    try:
        with open(json_filename, 'r', encoding='utf-8') as f:
            airlines = json.load(f)
    except FileNotFoundError:
        print(f"❌ Error: The file '{json_filename}' was not found.")
        return
    except json.JSONDecodeError:
        print(f"❌ Error: The file '{json_filename}' is not a valid JSON file.")
        return

    # 3. Loop through airlines and download logos
    download_count = 0
    skipped_existing_count = 0
    skipped_error_count = 0
    total_airlines = len(airlines)
    
    print(f"\n✈️  Starting download for {total_airlines} airlines...")

    for i, airline in enumerate(airlines):
        # Use .get() to safely access the key, which might be missing
        iata_code = airline.get("iata")

        # Update progress bar on the same line
        progress = (i + 1) / total_airlines
        percent = progress * 100
        bar = '█' * int(progress * 40) # Create a visual bar
        status_line = f"Progress: [{bar:<40}] {i+1}/{total_airlines} ({percent:.1f}%)"
        print(status_line, end='\r')
        sys.stdout.flush()

        # Validate the IATA code: must be a 2-character alphanumeric string.
        if not iata_code or not iata_code.isalnum() or len(iata_code) != 2:
            skipped_error_count += 1
            continue

        # Construct the specific URL and the local file path
        image_url = base_url.format(iata=iata_code)
        # --- NOTE: The file is being saved with a .png extension as requested ---
        file_path = os.path.join(output_folder, f"{iata_code}.png")

        # Check if the file already exists
        if os.path.exists(file_path):
            skipped_existing_count += 1
            continue # Skip to the next airline

        try:
            # Make the web request to get the image
            response = requests.get(image_url, timeout=10)

            # Check if the image was found and the request was successful
            if response.status_code == 200:
                with open(file_path, 'wb') as f:
                    f.write(response.content)
                download_count += 1
            else:
                skipped_error_count += 1

        except requests.exceptions.RequestException:
            # Handle network errors (e.g., timeout, no connection)
            skipped_error_count += 1

    # Print a new line after the progress bar is complete
    print()

    # 4. Show the final report
    print("\n" + "="*35)
    print("📊 Download Report")
    print("="*35)
    print(f"✅ New images downloaded: {download_count}")
    print(f"👍 Skipped (already existed): {skipped_existing_count}")
    print(f"⚠️ Skipped (invalid IATA or error): {skipped_error_count}")
    print("="*35)


# Run the main function
if __name__ == "__main__":
    download_airline_logos()

