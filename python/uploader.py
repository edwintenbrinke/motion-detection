import os
import requests
import config

def upload_video(output_file):
    try:
        print(f"Uploading {output_file} to {config.API_VIDEO_ENDPOINT}")
        with open(output_file, 'rb') as file:
            response = requests.post(config.API_VIDEO_ENDPOINT, files={"file": file}, verify=False)
            if response.status_code == 200:
                print("File uploaded successfully")
                os.remove(output_file)
            else:
                print(f"Failed to upload file: {response.status_code}")
    except Exception as e:
        print(f"Error uploading video: {str(e)}")
