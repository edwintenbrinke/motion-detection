# motion-detection
Save &amp; Display video feed based on motion detection


### TODO List
add swagger/openAPI to api FUCk this annoying shit keeps complaining about swagger_ui not available \
fingerprint auth on app (https://claude.ai/chat/7d04052c-77b0-4388-9661-dbe98149e49d)
php tests?\
disk usage/server specs page?\

##
BUG
- sometimes the rasp sends a stream with 0 bytes. processing fails with following error
```
Conversion failed: /var/www/symfony/private/UnprocessedRecordings/motion_2025_02_25T19_41_24.h264 {"exception":"The command \"'/usr/bin/ffmpeg' '-i' '/var/www/symfony/private/UnprocessedRecordings/motion_2025_02_25T19_41_24.h264' '-c:v' 'libx264' '-c:a' 'aac' '-strict' 'experimental' '/var/www/symfony/public/recordings/motion_2025_02_25T19_41_24.mp4'\" failed.\n\nExit Code: 1(General error)\n\nWorking directory: /var/www/symfony/public\n\nOutput:\n================\n\n\nError Output:\n================\nffmpeg version 5.1.6-0+deb12u1 Copyright (c) 2000-2024 the FFmpeg developers\n  built with gcc 12 (Debian 12.2.0-14)\n  configuration: --prefix=/usr --extra-version=0+deb12u1 --toolchain=hardened --libdir=/usr/lib/x86_64-linux-gnu --incdir=/usr/include/x86_64-linux-gnu --arch=amd64 --enable-gpl --disable-stripping --enable-gnutls --enable-ladspa --enable-libaom --enable-libass --enable-libbluray --enable-libbs2b --enable-libcaca --enable-libcdio --enable-libcodec2 --enable-libdav1d --enable-libflite --enable-libfontconfig --enable-libfreetype --enable-libfribidi --enable-libglslang --enable-libgme --enable-libgsm --enable-libjack --enable-libmp3lame --enable-libmysofa --enable-libopenjpeg --enable-libopenmpt --enable-libopus --enable-libpulse --enable-librabbitmq --enable-librist --enable-librubberband --enable-libshine --enable-libsnappy --enable-libsoxr --enable-libspeex --enable-libsrt --enable-libssh --enable-libsvtav1 --enable-libtheora --enable-libtwolame --enable-libvidstab --enable-libvorbis --enable-libvpx --enable-libwebp --enable-libx265 --enable-libxml2 --enable-libxvid --enable-libzimg --enable-libzmq --enable-libzvbi --enable-lv2 --enable-omx --enable-openal --enable-opencl --enable-opengl --enable-sdl2 --disable-sndio --enable-libjxl --enable-pocketsphinx --enable-librsvg --enable-libmfx --enable-libdc1394 --enable-libdrm --enable-libiec61883 --enable-chromaprint --enable-frei0r --enable-libx264 --enable-libplacebo --enable-librav1e --enable-shared\n  libavutil      57. 28.100 / 57. 28.100\n  libavcodec     59. 37.100 / 59. 37.100\n  libavformat    59. 27.100 / 59. 27.100\n  libavdevice    59.  7.100 / 59.  7.100\n  libavfilter     8. 44.100 /  8. 44.100\n  libswscale      6.  7.100 /  6.  7.100\n  libswresample   4.  7.100 /  4.  7.100\n  libpostproc    56.  6.100 / 56.  6.100\n[h264 @ 0x572ba38b5f00] Format h264 detected only with low score of 1, misdetection possible!\n[h264 @ 0x572ba38b5f00] Could not find codec parameters for stream 0 (Video: h264, none): unspecified size\nConsider increasing the value for the 'analyzeduration' (0) and 'probesize' (5000000) options\nInput #0, h264, from '/var/www/symfony/private/UnprocessedRecordings/motion_2025_02_25T19_41_24.h264':\n  Duration: N/A, bitrate: N/A\n  Stream #0:0: Video: h264, none, 25 tbr, 1200k tbn\nOutput #0, mp4, to '/var/www/symfony/public/recordings/motion_2025_02_25T19_41_24.mp4':\nOutput file #0 does not contain any stream\n","input":"/var/www/symfony/private/UnprocessedRecordings/motion_2025_02_25T19_41_24.h264","output":"/var/www/symfony/public/recordings/motion_2025_02_25T19_41_24.mp4"} []
```
- be able to view rasp livestream from web/app without it running OOM cuz network call keeps connected