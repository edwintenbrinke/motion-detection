from picamera2.encoders import H264Encoder
from picamera2.outputs import FileOutput
from datetime import datetime
import threading
from api_client import APIClient

class VideoHandler:
    def __init__(self, picam2):
        self.picam2 = picam2
        self.api_client = APIClient()
        self.current_recording = None
        self.encoder = None

    def start_recording(self):
        """Start recording video"""
        try:
            if self.current_recording:
                self.stop_recording()

            timestamp = datetime.utcnow().strftime('%Y_%m_%dT%H_%M_%S')
            output_file = f"motion_{timestamp}.h264"

            self.encoder = H264Encoder()
            self.picam2.start_encoder(
                self.encoder,
                FileOutput(output_file)
            )
            self.current_recording = output_file
            print(f"Started recording: {output_file}")
            return True
        except Exception as e:
            print(f"Error starting recording: {str(e)}")
            return False

    def stop_recording(self):
        """Stop recording and upload video"""
        if self.current_recording:
            try:
                self.picam2.stop_encoder()
                output_file = self.current_recording
                self.current_recording = None
                
                # Upload in separate thread
                threading.Thread(
                    target=self._upload_video_file,
                    args=(output_file,),
                    daemon=True
                ).start()
            except Exception as e:
                print(f"Error stopping recording: {str(e)}")

    def _upload_video_file(self, output_file):
        """Handle video upload"""
        try:
            self.api_client.upload_video(output_file)
        except Exception as e:
            print(f"Error uploading video file: {str(e)}")