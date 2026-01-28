import React, { useState, useEffect, useCallback } from 'react';
import { Volume2, VolumeX, SkipForward, Play, Pause, Music } from 'lucide-react';
import {
  initBgm,
  playBgm,
  pauseBgm,
  playNextBgm,
  setBgmVolume,
  getBgmVolume,
  isBgmPlaying,
  getCurrentTrackName,
  cleanup,
} from '../services/audioService';

interface AudioControllerProps {
  isAdmin: boolean;
}

const AudioController: React.FC<AudioControllerProps> = ({ isAdmin }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [trackName, setTrackName] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    
    initBgm();
    setVolume(getBgmVolume());
    
    return () => {
      cleanup();
    };
  }, [isAdmin]);

  // Update track name periodically
  useEffect(() => {
    if (!isAdmin) return;
    
    const interval = setInterval(() => {
      setTrackName(getCurrentTrackName());
      setIsPlaying(isBgmPlaying());
    }, 500);
    
    return () => clearInterval(interval);
  }, [isAdmin]);

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      pauseBgm();
    } else {
      playBgm();
    }
    setIsPlaying(!isPlaying);
    setTrackName(getCurrentTrackName());
  }, [isPlaying]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = Number.parseFloat(e.target.value);
    setVolume(newVolume);
    setBgmVolume(newVolume);
  }, []);

  const handleSkip = useCallback(() => {
    playNextBgm();
    setTrackName(getCurrentTrackName());
  }, []);

  if (!isAdmin) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 1000,
      }}
    >
      {/* Collapsed button */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: isPlaying 
              ? 'linear-gradient(135deg, #667eea, #764ba2)' 
              : 'linear-gradient(135deg, #4a5568, #2d3748)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
            transition: 'all 0.3s ease',
          }}
          title="Audio Controls"
        >
          <Music size={24} color="white" />
        </button>
      )}

      {/* Expanded panel */}
      {isExpanded && (
        <div
          style={{
            background: 'rgba(20, 20, 30, 0.95)',
            backdropFilter: 'blur(10px)',
            borderRadius: '16px',
            padding: '16px',
            minWidth: '280px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          {/* Header */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '12px',
          }}>
            <span style={{ 
              color: '#a78bfa', 
              fontWeight: 600,
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              <Music size={16} />
              BGM Controller
            </span>
            <button
              onClick={() => setIsExpanded(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                fontSize: '18px',
                padding: '2px 8px',
              }}
            >
              ×
            </button>
          </div>

          {/* Track name */}
          <div style={{
            color: '#fff',
            fontSize: '13px',
            marginBottom: '12px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            background: 'rgba(255,255,255,0.05)',
            padding: '8px 12px',
            borderRadius: '8px',
          }}>
            🎵 {trackName || 'No track selected'}
          </div>

          {/* Controls */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px',
            marginBottom: '12px',
          }}>
            {/* Play/Pause */}
            <button
              onClick={handleTogglePlay}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: isPlaying 
                  ? 'linear-gradient(135deg, #667eea, #764ba2)' 
                  : 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}
            >
              {isPlaying ? (
                <Pause size={18} color="white" />
              ) : (
                <Play size={18} color="white" style={{ marginLeft: '2px' }} />
              )}
            </button>

            {/* Skip */}
            <button
              onClick={handleSkip}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}
              title="Next Track"
            >
              <SkipForward size={16} color="white" />
            </button>

            {/* Volume icon */}
            <div style={{ color: '#888' }}>
              {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </div>

            {/* Volume slider */}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={handleVolumeChange}
              style={{
                flex: 1,
                height: '4px',
                borderRadius: '2px',
                appearance: 'none',
                background: `linear-gradient(to right, #667eea 0%, #667eea ${volume * 100}%, #4a5568 ${volume * 100}%, #4a5568 100%)`,
                cursor: 'pointer',
              }}
            />
          </div>

          {/* Volume percentage */}
          <div style={{
            color: '#666',
            fontSize: '11px',
            textAlign: 'right',
          }}>
            Volume: {Math.round(volume * 100)}%
          </div>
        </div>
      )}
    </div>
  );
};

export default AudioController;
