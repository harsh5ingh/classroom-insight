"""Bounded, optional Librosa spectral features. No transcript or speaker inference."""
import math
from functools import lru_cache
import numpy as np

@lru_cache(maxsize=1)
def librosa_engine():
    try:
        import librosa
        # Force lazy imports before declaring the optional engine usable.
        librosa.feature.spectral_centroid(S=np.ones((257,1)),sr=16000,n_fft=512)
        return librosa
    except Exception:
        return None

class AudioFeatures:
    def __init__(self,duration,threshold=.015):
        if not math.isfinite(threshold) or not .001<=threshold<=.5: raise ValueError('Audio threshold must be 0.001 to 0.5 RMS.')
        self.threshold=threshold;self.step=max(1,math.ceil(duration/360));self.rows=[];self.spectrum=[];self.waveform=[]
        self.engine=librosa_engine();self.active=0.;self.noisy=0.;self.duration=0.
    def add(self,mono,rate,second):
        length=len(mono)/rate
        # Resample each bounded one-second block. Original recordings never load in full.
        if self.engine:
            signal=self.engine.resample(mono.astype(np.float32),orig_sr=rate,target_sr=16000,res_type='polyphase') if rate!=16000 else mono.astype(np.float32)
            effective=16000
        else:
            signal=mono;effective=rate
        rms=float(np.sqrt(np.mean(signal**2))) if len(signal) else 0.
        zcr=float(np.mean(np.diff(np.signbit(signal))!=0)) if len(signal)>1 else 0.
        n=512; padded=np.pad(signal,(0,max(0,n-len(signal))))
        blocks=np.lib.stride_tricks.sliding_window_view(padded,n)[::max(1,n//2)]
        magnitude=np.abs(np.fft.rfft(blocks*np.hanning(n),axis=1)).T
        frequencies=np.fft.rfftfreq(n,1/effective);power=np.mean(magnitude**2,axis=1);total=max(float(power.sum()),1e-20)
        if self.engine:
            centroid=float(np.mean(self.engine.feature.spectral_centroid(S=magnitude,sr=effective,n_fft=n)))
            rolloff=float(np.mean(self.engine.feature.spectral_rolloff(S=magnitude,sr=effective,n_fft=n,roll_percent=.85)))
        else:
            centroid=float(np.sum(frequencies*power)/total)
            rolloff=float(frequencies[min(len(frequencies)-1,int(np.searchsorted(np.cumsum(power),total*.85)))])
        usable=power[(frequencies>=100)&(frequencies<=min(rate,effective)*.45)]
        flatness=float(np.exp(np.mean(np.log(usable+1e-20)))/(np.mean(usable)+1e-20)) if len(usable) else 0.
        category='silence' if rms<self.threshold else 'broadband_activity' if flatness>.3 else 'structured_activity'
        self.duration+=length;self.active+=length*(rms>=self.threshold);self.noisy+=length*(category=='broadband_activity')
        if second%self.step: return
        self.rows.append({'seconds':second,'end_seconds':second+length,'rms':round(rms,6),'energy':round(rms*rms,8),'zcr':round(zcr,5),'centroid_hz':round(centroid,1),'rolloff_hz':round(rolloff,1),'flatness':round(flatness,5),'category':category})
        # Coarse spectra and min/max waveform envelopes cannot reconstruct intelligible speech.
        edges=np.linspace(0,len(power),33,dtype=int)
        self.spectrum.append({'seconds':second,'db':[round(float(max(-100,min(0,10*np.log10(np.mean(power[a:b])/max(n*n,1)+1e-12)))),1) for a,b in zip(edges[:-1],edges[1:])]})
        self.waveform.append({'seconds':second,'minimum':round(float(np.min(signal)),5),'maximum':round(float(np.max(signal)),5)})
    def result(self):
        return {'engine':'librosa' if self.engine else 'numpy_fallback','normalized_sample_rate':16000 if self.engine else None,
                'threshold':self.threshold,'features':self.rows,'spectrogram':self.spectrum,'waveform':self.waveform,
                'feature_stride_seconds':self.step,'broadband_activity_fraction':self.noisy/self.duration if self.duration else None,
                'silence_fraction':1-self.active/self.duration if self.duration else None,
                'method':'Channel mean to mono; optional Librosa polyphase resampling to 16kHz; 512-sample Hann FFT. RMS, ZCR, power, centroid, 85% rolloff and spectral flatness. Visualization samples at most 360 one-second windows; not a continuous waveform.',
                'limitations':'Broadband sound is a noise-like heuristic, not measured classroom noise, dB SPL, speech recognition, speaker identity or conversation turns. Coarse spectral/envelope summaries retained; original audio retention follows upload settings.'}
