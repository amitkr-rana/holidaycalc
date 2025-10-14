import json
import os
import shutil
import sys

def convert_icao_logos_to_iata():
    """
    Scans a source folder for PNGs named with ICAO codes, finds the
    corresponding IATA code from airlines.json, and copies/renames the
    logo to a destination folder if it doesn't already exist there.
    """
    # --- Configuration ---
    # IMPORTANT: The backslash in Windows paths needs to be escaped, or use a raw string.
    source_folder = r"C:\Users\amitk\Downloads\airline-logos-main"
    dest_folder = "logos"
    json_filename = "airlines.json"

    # 1. Verify that the source and destination folders exist
    if not os.path.isdir(source_folder):
        print(f"❌ Error: Source directory not found at '{source_folder}'")
        return
        
    os.makedirs(dest_folder, exist_ok=True)
    print(f"📁 Source: '{source_folder}'")
    print(f"📁 Destination: '{dest_folder}'")

    # 2. Read the JSON file and create an ICAO -> IATA mapping for quick lookups
    try:
        with open(json_filename, 'r', encoding='utf-8') as f:
            airlines = json.load(f)
        
        # Create a dictionary like {'AAL': 'AA', 'DAL': 'DL'}
        icao_to_iata_map = {
            airline.get("icao"): airline.get("iata")
            for airline in airlines
            if airline.get("icao") and airline.get("iata") # Ensure both keys exist
        }
        print(f"🗺️  Successfully created ICAO to IATA map from '{json_filename}'.")

    except FileNotFoundError:
        print(f"❌ Error: The file '{json_filename}' was not found.")
        return
    except json.JSONDecodeError:
        print(f"❌ Error: The file '{json_filename}' is not a valid JSON file.")
        return

    # 3. Iterate through PNG files in the source folder
    copied_count = 0
    skipped_existing_count = 0
    skipped_unmapped_count = 0
    skipped_invalid_iata_count = 0 # New counter for bad IATA data like '\N'
    
    # Get a list of all files to process to show a proper progress bar
    files_to_process = [f for f in os.listdir(source_folder) if f.lower().endswith('.png')]
    total_files = len(files_to_process)

    if total_files == 0:
        print("\n⚠️ No PNG files found in the source directory.")
        return

    print(f"\n⚙️  Processing {total_files} PNG files...")

    for i, filename in enumerate(files_to_process):
        # Extract the ICAO code from the filename (e.g., "AAL.png" -> "AAL")
        icao_code = os.path.splitext(filename)[0]
        
        # Update progress bar
        progress = (i + 1) / total_files
        percent = progress * 100
        bar = '█' * int(progress * 40)
        status_line = f"Progress: [{bar:<40}] {i+1}/{total_files} ({percent:.1f}%)"
        print(status_line, end='\r')
        sys.stdout.flush()

        # Find the corresponding IATA code from our map
        iata_code = icao_to_iata_map.get(icao_code)

        if iata_code:
            # --- MODIFICATION: Validate the IATA code before using it ---
            if iata_code.isalnum() and len(iata_code) == 2:
                # Construct the full path for the destination file
                dest_filepath = os.path.join(dest_folder, f"{iata_code}.png")

                # Check if the IATA-named logo already exists in the destination
                if not os.path.exists(dest_filepath):
                    source_filepath = os.path.join(source_folder, filename)
                    # Copy the file and rename it in the process
                    shutil.copy(source_filepath, dest_filepath)
                    copied_count += 1
                else:
                    skipped_existing_count += 1
            else:
                # The IATA code from the JSON was invalid (e.g., '\N', '-', etc.)
                skipped_invalid_iata_count += 1
        else:
            # This ICAO code was not found in our mapping
            skipped_unmapped_count += 1
    
    # Print a new line after the progress bar finishes
    print()

    # 4. Show the final report
    print("\n" + "="*45)
    print("📊 Conversion Report")
    print("="*45)
    print(f"✅ Files copied and renamed: {copied_count}")
    print(f"👍 Skipped (IATA logo already existed): {skipped_existing_count}")
    print(f"❓ Skipped (ICAO code not in JSON): {skipped_unmapped_count}")
    print(f"⚠️ Skipped (IATA code was invalid, e.g., '\\N'): {skipped_invalid_iata_count}")
    print("="*45)

# Run the main function
if __name__ == "__main__":
    convert_icao_logos_to_iata()

