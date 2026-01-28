// Audio Service for BGM and SFX management (Admin only)

// BGM tracks list (relative paths - served from publicDir)
const BGM_TRACKS = [
  'audios/bgm/disco_desk_dash.mp3',
  'audios/bgm/disco_desk_dash_alt.mp3',
  'audios/bgm/dreamy_office_groove.mp3',
  'audios/bgm/dreamy_office_groove_alt.mp3',
  'audios/bgm/office_party_loop.mp3',
  'audios/bgm/office_party_loop_alt.mp3',
  'audios/bgm/sunlit_desk_bounce.mp3',
  'audios/bgm/sunlit_desk_bounce_alt.mp3',
];

// SFX tracks list with descriptive names for AI matching
export const SFX_TRACKS = [
  { id: 'among_us_reveal', path: 'audios/sfx/among_us_reveal.mp3', tags: ['reveal', 'among us', 'role', 'suspense'] },
  { id: 'bob_esponja_fail', path: 'audios/sfx/bob_esponja_fail.mp3', tags: ['fail', 'sad', 'mistake'] },
  { id: 'boss_music', path: 'audios/sfx/boss_music.mp3', tags: ['dramatic', 'boss', 'intense', 'pressure'] },
  { id: 'bruh_meme', path: 'audios/sfx/bruh_meme.mp3', tags: ['bruh', 'wow', 'really', 'unbelievable'] },
  { id: 'coffin_dance_meme', path: 'audios/sfx/coffin_dance_meme.mp3', tags: ['dead', 'rip', 'overtime', 'death'] },
  { id: 'directed_by_robert_weide', path: 'audios/sfx/directed_by_robert_weide.mp3', tags: ['fail', 'ironic', 'awkward', 'ending'] },
  { id: 'dj_stop', path: 'audios/sfx/dj_stop.mp3', tags: ['stop', 'wait', 'hold', 'pause'] },
  { id: 'dun_dun_dun', path: 'audios/sfx/dun_dun_dun.mp3', tags: ['dramatic', 'reveal', 'suspense', 'surprise'] },
  { id: 'emotional_damage', path: 'audios/sfx/emotional_damage.mp3', tags: ['hurt', 'pain', 'emotional', 'damage'] },
  { id: 'french_meme_song', path: 'audios/sfx/french_meme_song.mp3', tags: ['happy', 'fun', 'celebration', 'dance'] },
  { id: 'huh', path: 'audios/sfx/huh.mp3', tags: ['confused', 'what', 'huh'] },
  { id: 'huh_cat', path: 'audios/sfx/huh_cat.mp3', tags: ['confused', 'what', 'cat', 'huh'] },
  { id: 'illuminati', path: 'audios/sfx/illuminati.mp3', tags: ['mystery', 'conspiracy', 'secret', 'suspicious'] },
  { id: 'jojo_ayayayay', path: 'audios/sfx/jojo_ayayayay.mp3', tags: ['dramatic', 'epic', 'jojo', 'anime'] },
  { id: 'metal_gear_alert', path: 'audios/sfx/metal_gear_alert.mp3', tags: ['alert', 'caught', 'warning', 'notification'] },
  { id: 'minecraft_damage', path: 'audios/sfx/minecraft_damage.mp3', tags: ['hurt', 'damage', 'oof', 'pain'] },
  { id: 'mlg_airhorn', path: 'audios/sfx/mlg_airhorn.mp3', tags: ['celebration', 'win', 'victory', 'hype'] },
  { id: 'nani', path: 'audios/sfx/nani.mp3', tags: ['what', 'shocked', 'surprised', 'nani'] },
  { id: 'oh_no', path: 'audios/sfx/oh_no.mp3', tags: ['oh no', 'bad', 'trouble', 'problem'] },
  { id: 'run_vine', path: 'audios/sfx/run_vine.mp3', tags: ['run', 'escape', 'danger', 'flee'] },
  { id: 'sad_violin', path: 'audios/sfx/sad_violin.mp3', tags: ['sad', 'tragic', 'emotional', 'dramatic'] },
  { id: 'shocked', path: 'audios/sfx/shocked.mp3', tags: ['shocked', 'surprised', 'gasp', 'wow'] },
  { id: 'spiderman_meme_song', path: 'audios/sfx/spiderman_meme_song.mp3', tags: ['spiderman', 'cool', 'hero', 'epic'] },
  { id: 'windows_xp_startup', path: 'audios/sfx/windows_xp_startup.mp3', tags: ['startup', 'begin', 'nostalgia', 'windows'] },
];

// Audio state
interface AudioState {
  bgmAudio: HTMLAudioElement | null;
  sfxAudio: HTMLAudioElement | null;
  bgmVolume: number;
  isBgmPlaying: boolean;
  currentTrackIndex: number;
  isDucking: boolean;
}

const state: AudioState = {
  bgmAudio: null,
  sfxAudio: null,
  bgmVolume: 0.5,
  isBgmPlaying: false,
  currentTrackIndex: -1,
  isDucking: false,
};

// Shuffle array helper
const shuffleArray = <T>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

let shuffledBgmTracks = shuffleArray(BGM_TRACKS);

// LocalStorage keys for BGM persistence
const LS_BGM_TRACK = 'bgm_track_path';
const LS_BGM_TIME = 'bgm_current_time';
const LS_BGM_VOLUME = 'bgm_volume';
const LS_BGM_WAS_PLAYING = 'bgm_was_playing';

// Save BGM state to localStorage
const saveBgmState = () => {
  if (!state.bgmAudio) return;
  
  const trackPath = shuffledBgmTracks[state.currentTrackIndex];
  if (trackPath) {
    localStorage.setItem(LS_BGM_TRACK, trackPath);
    localStorage.setItem(LS_BGM_TIME, state.bgmAudio.currentTime.toString());
    localStorage.setItem(LS_BGM_VOLUME, state.bgmVolume.toString());
    localStorage.setItem(LS_BGM_WAS_PLAYING, state.isBgmPlaying.toString());
  }
};

// Start periodic save (every 2 seconds)
let saveInterval: ReturnType<typeof setInterval> | null = null;

const startPeriodicSave = () => {
  if (saveInterval) return;
  saveInterval = setInterval(saveBgmState, 2000);
};

const stopPeriodicSave = () => {
  if (saveInterval) {
    clearInterval(saveInterval);
    saveInterval = null;
  }
};

// Initialize BGM with localStorage restore
export const initBgm = () => {
  if (state.bgmAudio) return;
  
  state.bgmAudio = new Audio();
  state.bgmAudio.loop = false;
  
  // Restore volume from localStorage
  const savedVolume = localStorage.getItem(LS_BGM_VOLUME);
  if (savedVolume) {
    state.bgmVolume = Number.parseFloat(savedVolume);
  }
  state.bgmAudio.volume = state.bgmVolume;
  
  // Restore track and position from localStorage
  const savedTrack = localStorage.getItem(LS_BGM_TRACK);
  const savedTime = localStorage.getItem(LS_BGM_TIME);
  
  if (savedTrack && BGM_TRACKS.includes(savedTrack)) {
    state.bgmAudio.src = savedTrack;
    state.currentTrackIndex = shuffledBgmTracks.indexOf(savedTrack);
    if (state.currentTrackIndex === -1) {
      // Track not in shuffled list, add it at the start
      shuffledBgmTracks = [savedTrack, ...shuffledBgmTracks.filter(t => t !== savedTrack)];
      state.currentTrackIndex = 0;
    }
    
    // Set saved position when audio is ready
    if (savedTime) {
      const handleCanPlay = () => {
        if (state.bgmAudio) {
          state.bgmAudio.currentTime = Number.parseFloat(savedTime);
          state.bgmAudio.removeEventListener('canplay', handleCanPlay);
        }
      };
      state.bgmAudio.addEventListener('canplay', handleCanPlay);
    }
    
    console.log('[AudioService] Restored BGM:', savedTrack, 'at', savedTime, 'seconds');
  }
  
  // Auto-play next track when current ends
  state.bgmAudio.addEventListener('ended', () => {
    playNextBgm();
  });
  
  // Save state before page unload
  window.addEventListener('beforeunload', saveBgmState);
  
  // Start periodic save
  startPeriodicSave();
};

// Play BGM
export const playBgm = () => {
  if (!state.bgmAudio) initBgm();
  if (!state.bgmAudio) return;
  
  if (state.currentTrackIndex === -1 || !state.bgmAudio.src) {
    shuffledBgmTracks = shuffleArray(BGM_TRACKS);
    state.currentTrackIndex = 0;
    state.bgmAudio.src = shuffledBgmTracks[0];
    console.log('[AudioService] Loading BGM:', shuffledBgmTracks[0]);
  }
  
  state.isBgmPlaying = true;
  
  // Try to play - handle autoplay policy
  const playPromise = state.bgmAudio.play();
  if (playPromise !== undefined) {
    playPromise
      .then(() => {
        console.log('[AudioService] BGM playing successfully');
      })
      .catch((error) => {
        console.error('[AudioService] BGM play failed:', error);
        // If autoplay blocked, we'll need user interaction via the controller
        state.isBgmPlaying = false;
      });
  }
};

// Pause BGM
export const pauseBgm = () => {
  if (!state.bgmAudio) return;
  state.bgmAudio.pause();
  state.isBgmPlaying = false;
};

// Toggle BGM
export const toggleBgm = (): boolean => {
  if (state.isBgmPlaying) {
    pauseBgm();
  } else {
    playBgm();
  }
  return state.isBgmPlaying;
};

// Play next track
export const playNextBgm = () => {
  if (!state.bgmAudio) return;
  
  state.currentTrackIndex = (state.currentTrackIndex + 1) % shuffledBgmTracks.length;
  
  // Reshuffle when we've gone through all tracks
  if (state.currentTrackIndex === 0) {
    shuffledBgmTracks = shuffleArray(BGM_TRACKS);
  }
  
  state.bgmAudio.src = shuffledBgmTracks[state.currentTrackIndex];
  if (state.isBgmPlaying) {
    state.bgmAudio.play().catch(console.error);
  }
};

// Set BGM volume
export const setBgmVolume = (volume: number) => {
  state.bgmVolume = Math.max(0, Math.min(1, volume));
  if (state.bgmAudio && !state.isDucking) {
    state.bgmAudio.volume = state.bgmVolume;
  }
};

// Get current BGM volume
export const getBgmVolume = (): number => state.bgmVolume;

// Get BGM playing state
export const isBgmPlaying = (): boolean => state.isBgmPlaying;

// Get current track name
export const getCurrentTrackName = (): string => {
  if (state.currentTrackIndex === -1) return '';
  const path = shuffledBgmTracks[state.currentTrackIndex];
  const filename = path.split('/').pop() || '';
  return filename.replace('.mp3', '').replace(/_/g, ' ');
};

// Play SFX with BGM ducking
export const playSfx = (sfxId?: string) => {
  // Pick random SFX if not specified
  const sfx = sfxId 
    ? SFX_TRACKS.find(s => s.id === sfxId) 
    : SFX_TRACKS[Math.floor(Math.random() * SFX_TRACKS.length)];
  
  if (!sfx) return;
  
  // Duck BGM
  if (state.bgmAudio && state.isBgmPlaying) {
    state.isDucking = true;
    state.bgmAudio.volume = state.bgmVolume * 0.2; // 80% reduction
  }
  
  // Play SFX
  state.sfxAudio = new Audio(sfx.path);
  state.sfxAudio.volume = 0.5;
  
  state.sfxAudio.addEventListener('ended', () => {
    // Restore BGM volume
    if (state.bgmAudio) {
      state.bgmAudio.volume = state.bgmVolume;
    }
    state.isDucking = false;
  });
  
  state.sfxAudio.play().catch(console.error);
};

// Get random SFX
export const getRandomSfx = () => {
  return SFX_TRACKS[Math.floor(Math.random() * SFX_TRACKS.length)];
};

// Stop all audio
export const stopAll = () => {
  if (state.bgmAudio) {
    state.bgmAudio.pause();
    state.bgmAudio.currentTime = 0;
  }
  if (state.sfxAudio) {
    state.sfxAudio.pause();
    state.sfxAudio.currentTime = 0;
  }
  state.isBgmPlaying = false;
  state.isDucking = false;
};

// Cleanup
export const cleanup = () => {
  stopAll();
  state.bgmAudio = null;
  state.sfxAudio = null;
  state.currentTrackIndex = -1;
};
