"""Generate non-sensitive signals for a reproducible manual upload test."""
from pathlib import Path
import wave
import numpy as np
import cv2

target=Path(__file__).resolve().parents[1]/'data'/'verification'
target.mkdir(parents=True,exist_ok=True)
with wave.open(str(target/'synthetic-tone.wav'),'wb') as audio:
    audio.setnchannels(1)
    audio.setsampwidth(2)
    audio.setframerate(8000)
    tone=np.sin(np.arange(16000)*2*np.pi*440/8000)*12000
    audio.writeframes(np.concatenate([np.zeros(16000),tone]).astype('<i2').tobytes())
video=cv2.VideoWriter(str(target/'synthetic-scene.avi'),cv2.VideoWriter_fourcc(*'MJPG'),5,(320,240))
if not video.isOpened():
    raise RuntimeError('MJPG encoder unavailable')
for i in range(60):
    frame=np.full((240,320,3),30+(i//15)*50,dtype=np.uint8)
    cv2.putText(frame,'SYNTHETIC TEST',(25,120),cv2.FONT_HERSHEY_SIMPLEX,.6,(255,255,255),1)
    video.write(frame)
video.release()
print(f'Synthetic files created in {target}. No people or speech are present.')
