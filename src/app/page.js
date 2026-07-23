'use client';

import React, { useState, useEffect, useRef } from 'react';

export default function Home() {
  // App States (Loaded in useEffect to prevent SSR hydration mismatches)
  const [apiKey, setApiKey] = useState('');
  const [hasServerKey, setHasServerKey] = useState(false);
  const [mode, setMode] = useState('simple'); // 'simple' | 'custom'
  const [activeTab, setActiveTab] = useState('library'); // 'library' | 'queue'

  // Library & Queue List states
  const [queue, setQueue] = useState([]);
  const [library, setLibrary] = useState([]);

  // Form Input States
  const [simplePrompt, setSimplePrompt] = useState('');
  const [customLyrics, setCustomLyrics] = useState('');
  const [customStyle, setCustomStyle] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [instrumentalToggle, setInstrumentalToggle] = useState(false);
  const [modelVersion, setModelVersion] = useState('V4_5ALL');

  // Custom Vocal, Mood, Occasion & Dedicated To States
  const [voice, setVoice] = useState('female'); // 'female' | 'male' | 'duet'
  const [mood, setMood] = useState('romantic'); // 'romantic' | 'happy' | 'sad' | 'energetic' | 'melancholic'
  const [occasion, setOccasion] = useState('love'); // 'love' | 'anniversary' | 'birthday' | 'friendship' | 'general'
  const [dedicatedTo, setDedicatedTo] = useState('');

  // Download Tracker Toast States
  const [downloadInfo, setDownloadInfo] = useState({
    show: false,
    title: '',
    progress: 0,
    status: 'starting' // 'starting' | 'downloading' | 'completed' | 'error'
  });

  // Mobile Navigation Drawer States
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);

  // Modal Control States
  const [showSettings, setShowSettings] = useState(false);
  const [showLyricsWriter, setShowLyricsWriter] = useState(false);
  const [showLyricsViewer, setShowLyricsViewer] = useState(false);

  // Key Visibility in input
  const [showKeyText, setShowKeyText] = useState(false);

  // Status/Loading States
  const [isDispatching, setIsDispatching] = useState(false);
  const [envNoticeVisible, setEnvNoticeVisible] = useState(false);

  // Accordion Expand
  const [accordionOpen, setAccordionOpen] = useState(false);

  // AI Lyrics Writer States
  const [lyricsPrompt, setLyricsPrompt] = useState('');
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false);
  const [generatedLyricsResult, setGeneratedLyricsResult] = useState('');
  const [lyricsTaskId, setLyricsTaskId] = useState('');

  // Selected Lyrics Viewer
  const [viewingSongLyrics, setViewingSongLyrics] = useState({ title: '', text: '' });

  // Centralized Audio Player state
  const [activeAudioId, setActiveAudioId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  // React References
  const audioRef = useRef(null);
  const pollingIntervals = useRef({});
  const lyricsPollTimer = useRef(null);
  const isSeeking = useRef(false);

  // 1. Initial mounting and state hydrations
  useEffect(() => {
    // Load local storage values safely on client mount
    const savedKey = localStorage.getItem('suno_api_key') || '';
    const savedQueue = JSON.parse(localStorage.getItem('suno_queue')) || [];
    const savedLibrary = JSON.parse(localStorage.getItem('suno_library')) || [];

    setApiKey(savedKey);
    setQueue(savedQueue);
    setLibrary(savedLibrary);

    // Initial server config-check
    fetch('/api/config-check')
      .then(res => res.json())
      .then(data => {
        setHasServerKey(data.hasServerKey);
        setEnvNoticeVisible(data.hasServerKey);
      })
      .catch(err => console.error('Failed checking server configs:', err));

    // Cleanup active status polling on unmount
    return () => {
      Object.values(pollingIntervals.current).forEach(clearInterval);
      if (lyricsPollTimer.current) clearInterval(lyricsPollTimer.current);
    };
  }, []);

  // 2. Local storage Sync effects
  useEffect(() => {
    if (queue.length > 0) {
      localStorage.setItem('suno_queue', JSON.stringify(queue));
    } else {
      localStorage.removeItem('suno_queue');
    }
  }, [queue]);

  useEffect(() => {
    if (library.length > 0) {
      localStorage.setItem('suno_library', JSON.stringify(library));
    } else {
      localStorage.removeItem('suno_library');
    }
  }, [library]);

  // 3. Resume polling for tasks still active from a previous session
  useEffect(() => {
    if (queue.length > 0) {
      queue.forEach(task => {
        if (task.status !== 'SUCCESS' && task.status !== 'FAILED') {
          pollTaskStatus(task.taskId);
        }
      });
    }
  }, [queue.length]);

  // 4. Central Audio Instance Setup
  useEffect(() => {
    // Initialize standard single HTML5 Audio element on client
    audioRef.current = new Audio();

    const handleLoadedMetadata = () => {
      setDuration(audioRef.current.duration);
    };

    const handleTimeUpdate = () => {
      if (!isSeeking.current) {
        setCurrentTime(audioRef.current.currentTime);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      setActiveAudioId(null);
    };

    audioRef.current.addEventListener('loadedmetadata', handleLoadedMetadata);
    audioRef.current.addEventListener('timeupdate', handleTimeUpdate);
    audioRef.current.addEventListener('ended', handleEnded);

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audioRef.current.removeEventListener('timeupdate', handleTimeUpdate);
        audioRef.current.removeEventListener('ended', handleEnded);
      }
    };
  }, []);

  // Central Audio Volume Sync
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Helper Headers Constructor
  const getRequestHeaders = () => {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['x-suno-api-key'] = apiKey;
    }
    return headers;
  };

  // Submit trigger for music generation
  const handleMusicSubmit = async (e) => {
    e.preventDefault();

    const isKeyAvailable = apiKey.trim() !== '' || hasServerKey;
    if (!isKeyAvailable) {
      setShowSettings(true);
      alert('Please configure your Suno API Key first!');
      return;
    }

    const customMode = mode === 'custom';
    const promptValue = customMode ? customLyrics.trim() : simplePrompt.trim();

    if (promptValue === '') {
      alert('Please fill out the prompt text area.');
      return;
    }

    setIsDispatching(true);

    try {
      // Append vocal, mood and dedication tags to prompt/style
      let finalPrompt = promptValue;
      let finalStyle = customStyle.trim();

      const descriptiveTags = [];
      if (voice) descriptiveTags.push(`${voice} vocals`);
      if (mood) descriptiveTags.push(`${mood} mood`);
      if (occasion && occasion !== 'general') descriptiveTags.push(`theme of ${occasion}`);
      if (dedicatedTo.trim()) descriptiveTags.push(`dedicated to ${dedicatedTo.trim()}`);

      if (customMode) {
        const styleTags = [];
        if (voice) styleTags.push(`${voice} vocals`);
        if (mood) styleTags.push(mood);
        if (styleTags.length > 0) {
          finalStyle = finalStyle ? `${finalStyle}, ${styleTags.join(', ')}` : styleTags.join(', ');
        }
      } else {
        if (descriptiveTags.length > 0) {
          finalPrompt = `${promptValue} [${descriptiveTags.join(', ')}]`;
        }
      }

      const payload = {
        prompt: finalPrompt,
        customMode,
        instrumental: instrumentalToggle,
        model: modelVersion
      };

      if (customMode) {
        payload.style = finalStyle;
        payload.title = customTitle.trim() || (dedicatedTo.trim() ? `For ${dedicatedTo.trim()}` : 'Custom Track');
      }

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (response.ok && result.code === 200 && result.data?.taskId) {
        const taskId = result.data.taskId;

        const newTask = {
          taskId,
          prompt: customMode ? (customTitle.trim() || 'Custom Track') : promptValue,
          status: 'PENDING',
          createdAt: new Date().toISOString()
        };

        setQueue(prev => [...prev, newTask]);

        // Clean inputs
        if (customMode) {
          setCustomTitle('');
          setCustomLyrics('');
          setCustomStyle('');
        } else {
          setSimplePrompt('');
        }

        setActiveTab('queue');
        pollTaskStatus(taskId);
      } else {
        alert(`API Error: ${result.msg || 'Dispatch failed.'}`);
      }
    } catch (error) {
      console.error('Submit error:', error);
      alert(`Network Error: ${error.message}`);
    } finally {
      setIsDispatching(false);
    }
  };

  // Poll generating task status
  const pollTaskStatus = (taskId) => {
    if (pollingIntervals.current[taskId]) return;

    pollingIntervals.current[taskId] = setInterval(async () => {
      try {
        const response = await fetch(`/api/status?taskId=${taskId}`, {
          headers: getRequestHeaders()
        });

        if (!response.ok) return;

        const result = await response.json();

        if (result.code === 200 && result.data) {
          const taskDetails = result.data;
          const status = taskDetails.status;

          // Update task in state queue
          setQueue(prev => prev.map(t => t.taskId === taskId ? { ...t, status } : t));

          if (status === 'SUCCESS') {
            clearInterval(pollingIntervals.current[taskId]);
            delete pollingIntervals.current[taskId];

            const songs = taskDetails.response?.sunoData;
            if (songs && Array.isArray(songs)) {
              setLibrary(prev => {
                const updated = [...prev];
                songs.forEach(song => {
                  if (!updated.some(s => s.id === song.id)) {
                    updated.unshift({
                      id: song.id,
                      title: song.title || 'Untitled Synth',
                      audioUrl: song.audioUrl,
                      imageUrl: song.imageUrl || '',
                      style: song.style || '',
                      lyrics: song.lyrics || 'No lyrics available.',
                      model: song.model || 'Unknown',
                      createdAt: new Date().toISOString()
                    });
                  }
                });
                return updated;
              });

              // Swapping tab views
              setActiveTab('library');
            }

            // Remove from queue
            setQueue(prev => prev.filter(t => t.taskId !== taskId));

          } else if (status === 'FAILED') {
            clearInterval(pollingIntervals.current[taskId]);
            delete pollingIntervals.current[taskId];
            alert(`Task ${taskId} failed. Try adjust style tags or lyrics.`);
            setQueue(prev => prev.filter(t => t.taskId !== taskId));
          }
        }
      } catch (error) {
        console.error('Polling exception:', error);
      }
    }, 5000);
  };

  // Helper to open lyrics modal pre-composed with selected states
  const openLyricsWriter = () => {
    let preset = '';
    const nameStr = dedicatedTo.trim() ? ` for ${dedicatedTo.trim()}` : '';
    const occasionStr = occasion && occasion !== 'general' ? ` on the occasion of ${occasion}` : '';
    
    if (dedicatedTo.trim() || (occasion && occasion !== 'general')) {
      preset = `Write a ${mood} song${nameStr}${occasionStr}. Include theme of love and anniversary.`;
    } else {
      preset = `Write a ${mood} song.`;
    }
    setLyricsPrompt(preset);
    setShowLyricsWriter(true);
  };

  // Submits to get AI Lyrics
  const handleLyricsRequest = async () => {
    if (lyricsPrompt.trim() === '') {
      alert('Enter lyrics details first.');
      return;
    }

    setIsGeneratingLyrics(true);
    setGeneratedLyricsResult('');

    try {
      const response = await fetch('/api/lyrics', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ prompt: lyricsPrompt.trim() })
      });

      const result = await response.json();

      if (response.ok && result.code === 200 && result.data?.taskId) {
        const taskId = result.data.taskId;
        setLyricsTaskId(taskId);
        pollLyricsStatus(taskId);
      } else {
        alert(`Lyrics generation error: ${result.msg || 'Failed.'}`);
        setIsGeneratingLyrics(false);
      }
    } catch (error) {
      console.error(error);
      alert(`Lyrics Dispatch failed: ${error.message}`);
      setIsGeneratingLyrics(false);
    }
  };

  // Poll lyrics task status
  const pollLyricsStatus = (taskId) => {
    let count = 0;
    const limit = 40;

    lyricsPollTimer.current = setInterval(async () => {
      count++;
      if (count > limit) {
        clearInterval(lyricsPollTimer.current);
        alert('Lyrics writing timed out.');
        setIsGeneratingLyrics(false);
        return;
      }

      try {
        const response = await fetch(`/api/lyrics/status?taskId=${taskId}`, {
          headers: getRequestHeaders()
        });

        const result = await response.json();

        if (result.code === 200 && result.data) {
          const status = result.data.status;

          if (status === 'SUCCESS') {
            clearInterval(lyricsPollTimer.current);
            setGeneratedLyricsResult(result.data.response?.text || '');
            setIsGeneratingLyrics(false);
          } else if (status === 'FAILED') {
            clearInterval(lyricsPollTimer.current);
            alert('Lyrics writing failed on the API backend.');
            setIsGeneratingLyrics(false);
          }
        }
      } catch (error) {
        console.error(error);
      }
    }, 4000);
  };

  // Central Audio Playback controller function
  const handlePlayToggle = (track) => {
    if (activeAudioId === track.id) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
      return;
    }

    // New track play logic
    if (audioRef.current) {
      audioRef.current.pause();
    }

    audioRef.current.src = track.audioUrl;
    audioRef.current.load();

    setActiveAudioId(track.id);
    setIsPlaying(true);

    audioRef.current.play().catch(err => {
      console.error('Audio playback block:', err);
      setIsPlaying(false);
    });
  };

  // Volume slider event mappings
  const handleVolumeChange = (e) => {
    setVolume(parseFloat(e.target.value) / 100);
  };

  // Timeline scrub event mapping
  const handleScrubChange = (e) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  // Track scrubber drag states
  const handleScrubStart = () => {
    isSeeking.current = true;
  };

  const handleScrubEnd = () => {
    isSeeking.current = false;
  };

  // Remove track from list
  const handleDeleteTrack = (id) => {
    if (confirm('Delete this track from local history?')) {
      if (activeAudioId === id) {
        audioRef.current.pause();
        setIsPlaying(false);
        setActiveAudioId(null);
      }
      setLibrary(prev => prev.filter(item => item.id !== id));
    }
  };

  // Asynchronously fetch audio file via proxy to trace progress and trigger direct download
  const handleDownloadTrack = async (track) => {
    setDownloadInfo({
      show: true,
      title: track.title,
      progress: 0,
      status: 'starting'
    });

    try {
      const url = `/api/download?url=${encodeURIComponent(track.audioUrl)}&title=${encodeURIComponent(track.title)}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to download audio: ${response.statusText}`);
      }

      setDownloadInfo(prev => ({ ...prev, status: 'downloading' }));

      const reader = response.body.getReader();
      const contentLength = +response.headers.get('Content-Length') || 5000000; // default to 5MB if missing
      let receivedLength = 0;
      let chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        receivedLength += value.length;

        const pct = Math.round((receivedLength / contentLength) * 100);
        setDownloadInfo(prev => ({ ...prev, progress: Math.min(pct, 99) }));
      }

      setDownloadInfo(prev => ({ ...prev, progress: 100, status: 'completed' }));

      // Create local file URL and trigger download
      const blob = new Blob(chunks, { type: 'audio/mpeg' });
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const safeTitle = track.title.replace(/[^a-zA-Z0-9 Bengali\u0980-\u09FF\s-_]/g, '');
      a.download = `${safeTitle || 'song'}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);

      // Hide toast after short delay
      setTimeout(() => {
        setDownloadInfo(prev => ({ ...prev, show: false }));
      }, 2500);

    } catch (error) {
      console.error('Progressive download failed, falling back to window.open:', error);
      setDownloadInfo(prev => ({ ...prev, status: 'error', progress: 0 }));
      
      // Fallback
      window.open(track.audioUrl, '_blank');
      
      setTimeout(() => {
        setDownloadInfo(prev => ({ ...prev, show: false }));
      }, 3500);
    }
  };

  // Format MM:SS elapsed/durations
  const formatTime = (secs) => {
    if (isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Helper style badges appender
  const addStyleTag = (tag) => {
    if (customStyle.trim() === '') {
      setCustomStyle(tag);
    } else {
      const list = customStyle.split(',').map(s => s.trim());
      if (!list.includes(tag)) {
        setCustomStyle(prev => `${prev}, ${tag}`);
      }
    }
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', overflowX: 'hidden' }}>
      {/* Ambient background glows */}
      <div className="bg-glow bg-glow-1"></div>
      <div className="bg-glow bg-glow-2"></div>
      <div className="bg-glow bg-glow-3"></div>

      <div className="app-container">
        {/* Header section */}
        <header className="app-header">
          <div className="logo-area">
            <div className="logo-icon">
              <i className="fa-solid fa-wave-square"></i>
            </div>
            <div className="logo-text">
              <h1>AetherSynth</h1>
              <span className="sub-logo">Suno AI Music Studio</span>
            </div>
          </div>

          <div className="header-actions">
            <div className={`status-badge ${(apiKey || hasServerKey) ? 'status-connected' : 'status-disconnected'}`}>
              <span className="dot"></span>
              <span className="status-label">
                {(apiKey || hasServerKey) ? (apiKey ? 'Local Key Ready' : 'Server Key Connected') : 'API Key Missing'}
              </span>
            </div>

            <button className="icon-btn" onClick={() => setShowSettings(true)}>
              <i className="fa-solid fa-sliders"></i>
              <span>Settings</span>
            </button>
          </div>

          <button className="hamburger-btn" type="button" onClick={() => setShowMobileDrawer(true)}>
            <i className="fa-solid fa-bars"></i>
          </button>
        </header>

        {/* Dashboard grid */}
        <main className="workspace-grid">
          {/* Left panel inputs */}
          <section className="panel control-panel">
            <div className="panel-header">
              <h2><i className="fa-solid fa-wand-magic-sparkles"></i> Studio Console</h2>
            </div>

            <div className="tab-container">
              <button
                type="button"
                className={`tab-btn ${mode === 'simple' ? 'active' : ''}`}
                onClick={() => setMode('simple')}
              >
                <i className="fa-solid fa-bolt"></i> Simple Prompt
              </button>
              <button
                type="button"
                className={`tab-btn ${mode === 'custom' ? 'active' : ''}`}
                onClick={() => setMode('custom')}
              >
                <i className="fa-solid fa-sliders"></i> Custom Mode
              </button>
            </div>

            <form id="generator-form" onSubmit={handleMusicSubmit}>
              {mode === 'simple' ? (
                <div className="form-group form-fade">
                  <label htmlFor="simple-prompt">Song Description</label>
                  <textarea
                    id="simple-prompt"
                    value={simplePrompt}
                    onChange={(e) => setSimplePrompt(e.target.value)}
                    placeholder="Describe the style, genre, instruments, and mood... (e.g. 'An energetic cyber-punk synthwave track with soaring leads and heavy acoustic drums')"
                  />
                </div>
              ) : (
                <div className="form-fade custom-form-wrapper">
                  {/* Lyrics area */}
                  <div className="form-group">
                    <div className="label-row">
                      <label htmlFor="custom-lyrics">Lyrics Content</label>
                      <button
                        type="button"
                        className="text-link-btn"
                        onClick={openLyricsWriter}
                      >
                        <i className="fa-solid fa-pen-fancy"></i> AI Write Lyrics
                      </button>
                    </div>
                    <textarea
                      id="custom-lyrics"
                      value={customLyrics}
                      onChange={(e) => setCustomLyrics(e.target.value)}
                      placeholder="Enter your own lyrics, or let the AI write them for you... Use [Verse], [Chorus] headings."
                    />
                  </div>

                  {/* Style inputs */}
                  <div className="form-group">
                    <label htmlFor="custom-style">Music Style & Genre</label>
                    <input
                      type="text"
                      id="custom-style"
                      value={customStyle}
                      onChange={(e) => setCustomStyle(e.target.value)}
                      placeholder="e.g. synthwave, cyberpunk, energetic, female vocals"
                    />
                    <div className="tag-suggestions">
                      {['synthwave', 'cyberpunk', 'chillwave', 'lofi', 'heavy metal', 'hip hop', 'j-pop', 'acoustic'].map(tag => (
                        <span
                          key={tag}
                          className="tag-badge"
                          onClick={() => addStyleTag(tag)}
                        >
                          {tag.charAt(0).toUpperCase() + tag.slice(1)}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Title input */}
                  <div className="form-group">
                    <label htmlFor="custom-title">Song Title</label>
                    <input
                      type="text"
                      id="custom-title"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder="Give your song a name (optional)"
                    />
                  </div>
                </div>
              )}

              {/* Vocals & Mood Configuration (Always visible) */}
              <div className="form-group form-fade vocals-config-card">
                <label style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--accent-cyan)' }}>
                  <i className="fa-solid fa-microphone-lines"></i> Theme & Vocalist Settings
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label htmlFor="voice-select" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Vocalist Voice</label>
                    <select id="voice-select" value={voice} onChange={(e) => setVoice(e.target.value)}>
                      <option value="female">Female Vocals</option>
                      <option value="male">Male Vocals</option>
                      <option value="duet">Duet (Male & Female)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="mood-select" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Song Mood</label>
                    <select id="mood-select" value={mood} onChange={(e) => setMood(e.target.value)}>
                      <option value="romantic">Romantic</option>
                      <option value="happy">Happy & Upbeat</option>
                      <option value="sad">Sad & Emotional</option>
                      <option value="energetic">Energetic & Powerful</option>
                      <option value="melancholic">Melancholic</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label htmlFor="occasion-select" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Occasion</label>
                    <select id="occasion-select" value={occasion} onChange={(e) => setOccasion(e.target.value)}>
                      <option value="love">Love / Romance</option>
                      <option value="anniversary">Anniversary</option>
                      <option value="birthday">Birthday Celebration</option>
                      <option value="friendship">Friendship</option>
                      <option value="general">General / Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="dedicated-input" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Dedicated To (Name)</label>
                    <input 
                      type="text" 
                      id="dedicated-input" 
                      value={dedicatedTo} 
                      onChange={(e) => setDedicatedTo(e.target.value)} 
                      placeholder="e.g. Rikta" 
                    />
                  </div>
                </div>
              </div>

              {/* Collapsible engine settings */}
              <div className="options-accordion">
                <div
                  className="accordion-header"
                  onClick={() => setAccordionOpen(!accordionOpen)}
                >
                  <span><i className="fa-solid fa-gears"></i> Engine Settings</span>
                  <i className={`fa-solid ${accordionOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                </div>
                {accordionOpen && (
                  <div className="accordion-content">
                    <div className="toggle-row">
                      <div className="toggle-label-group">
                        <label htmlFor="instrumental-toggle">Instrumental Track</label>
                        <span className="toggle-desc">Generate music without lyrics / vocals</span>
                      </div>
                      <label className="switch">
                        <input
                          type="checkbox"
                          id="instrumental-toggle"
                          checked={instrumentalToggle}
                          onChange={(e) => setInstrumentalToggle(e.target.checked)}
                        />
                        <span className="slider round"></span>
                      </label>
                    </div>

                    <div className="form-group margin-top-sm">
                      <label htmlFor="model-select">Model Version</label>
                      <select
                        id="model-select"
                        value={modelVersion}
                        onChange={(e) => setModelVersion(e.target.value)}
                      >
                        <option value="V4_5ALL">Suno V4.5 (Newest & High Quality)</option>
                        <option value="V4">Suno V4 (Highly Stable)</option>
                        <option value="V3_5">Suno V3.5 (Fast generation)</option>
                        <option value="V5">Suno V5 (Beta experimental)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Submit dispatch button */}
              <button
                type="submit"
                id="generate-btn"
                className="primary-btn glow-btn"
                disabled={isDispatching}
              >
                {!isDispatching ? (
                  <span className="btn-content">
                    <i className="fa-solid fa-music"></i> Synthesize Track
                  </span>
                ) : (
                  <span className="btn-loader">
                    <i className="fa-solid fa-circle-notch fa-spin"></i> Dispatching request...
                  </span>
                )}
              </button>
            </form>
          </section>

          {/* Right panel output display */}
          <section className="panel output-panel">
            <div className="panel-tabs">
              <button
                className={`panel-tab-btn ${activeTab === 'library' ? 'active' : ''}`}
                onClick={() => setActiveTab('library')}
              >
                <i className="fa-solid fa-compact-disc"></i> My Library ({library.length})
              </button>
              <button
                className={`panel-tab-btn ${activeTab === 'queue' ? 'active' : ''}`}
                onClick={() => setActiveTab('queue')}
              >
                <i className="fa-solid fa-hourglass-half"></i> Generation Queue ({queue.length})
              </button>
            </div>

            <div className="panel-body">
              {activeTab === 'library' ? (
                <div className="view-content active">
                  {library.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon"><i className="fa-solid fa-compact-disc"></i></div>
                      <h3>No synthesized music yet</h3>
                      <p>Enter details on the left console, input your API key, and hit "Synthesize Track" to hear the magic.</p>
                    </div>
                  ) : (
                    <div className="cards-grid">
                      {library.map(track => {
                        const isCurrentPlaying = activeAudioId === track.id;
                        const cleanStyle = track.style ? (track.style.length > 45 ? `${track.style.substring(0, 42)}...` : track.style) : 'General';
                        const hasLyrics = track.lyrics && track.lyrics.trim() !== '' && track.lyrics !== 'No lyrics available.';

                        return (
                          <div
                            key={track.id}
                            className={`song-card ${isCurrentPlaying && isPlaying ? 'playing' : ''}`}
                            id={`card-${track.id}`}
                          >
                            <div className="song-meta">
                              <div className="album-art-wrapper">
                                {track.imageUrl ? (
                                  <img
                                    className="album-art"
                                    src={track.imageUrl}
                                    alt={track.title}
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                  />
                                ) : null}
                                <div className="album-art-placeholder"><i className="fa-solid fa-music"></i></div>
                              </div>
                              <div className="song-info">
                                <div className="song-title-row">
                                  <h4 className="song-title" title={track.title}>{track.title}</h4>
                                  <button
                                    className="delete-track-btn"
                                    onClick={() => handleDeleteTrack(track.id)}
                                    title="Remove Track"
                                  >
                                    <i className="fa-solid fa-trash-can"></i>
                                  </button>
                                </div>
                                <span className="song-style" title={track.style}>{cleanStyle}</span>
                                <span className="song-model-tag">{track.model.toUpperCase()}</span>
                              </div>
                            </div>

                            {/* Centrally controlled card player sliders */}
                            <div className="custom-player">
                              <div className="player-controls">
                                <button
                                  className="play-pause-btn"
                                  type="button"
                                  onClick={() => handlePlayToggle(track)}
                                >
                                  <i className={`fa-solid ${isCurrentPlaying && isPlaying ? 'fa-pause' : 'fa-play'}`}></i>
                                </button>
                                <div className="timeline-container">
                                  <span className="time-display elapsed">
                                    {isCurrentPlaying ? formatTime(currentTime) : '00:00'}
                                  </span>
                                  <input
                                    type="range"
                                    className="scrub-bar"
                                    value={isCurrentPlaying ? Math.floor(currentTime) : 0}
                                    min="0"
                                    max={isCurrentPlaying ? Math.floor(duration) || 100 : 100}
                                    onMouseDown={handleScrubStart}
                                    onTouchStart={handleScrubStart}
                                    onMouseUp={handleScrubEnd}
                                    onTouchEnd={handleScrubEnd}
                                    onChange={isCurrentPlaying ? handleScrubChange : () => { }}
                                  />
                                  <span className="time-display total">
                                    {isCurrentPlaying ? formatTime(duration) : '00:00'}
                                  </span>
                                </div>
                              </div>

                              <div className="player-sub-row">
                                <div className="volume-container">
                                  <i className="fa-solid fa-volume-high"></i>
                                  <input
                                    type="range"
                                    className="volume-slider"
                                    value={Math.floor(volume * 100)}
                                    min="0"
                                    max="100"
                                    onChange={handleVolumeChange}
                                  />
                                </div>
                                <div className="card-action-buttons">
                                  {hasLyrics ? (
                                    <button
                                      className="card-action-btn"
                                      type="button"
                                      onClick={() => {
                                        setViewingSongLyrics({ title: track.title, text: track.lyrics });
                                        setShowLyricsViewer(true);
                                      }}
                                    >
                                      <i className="fa-solid fa-quote-left"></i> Lyrics
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadTrack(track)}
                                    className="card-action-btn"
                                  >
                                    <i className="fa-solid fa-download"></i> Get File
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="view-content active">
                  {queue.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon"><i className="fa-solid fa-circle-nodes"></i></div>
                      <h3>Queue is clear</h3>
                      <p>Active generations will appear here with real-time status tracking.</p>
                    </div>
                  ) : (
                    <div className="queue-list">
                      {queue.map(task => {
                        const isProcessing = task.status === 'PROCESSING' || task.status === 'RUNNING' || task.status === 'TEXT_SUCCESS' || task.status === 'FIRST_SUCCESS';
                        const badgeClass = task.status === 'PENDING' ? 'status-pending'
                          : isProcessing ? 'status-running'
                            : 'status-failed';

                        // Determine progress percentage and stage text based on status values
                        let pct = 10;
                        let stageText = 'Waiting in queue';
                        
                        if (task.status === 'TEXT_SUCCESS') {
                          pct = 40;
                          stageText = 'Lyrics composed successfully';
                        } else if (task.status === 'FIRST_SUCCESS') {
                          pct = 75;
                          stageText = 'First audio track variation ready';
                        } else if (task.status === 'PROCESSING') {
                          pct = 30;
                          stageText = 'Processing request...';
                        } else if (task.status === 'RUNNING') {
                          pct = 60;
                          stageText = 'Synthesizing audio...';
                        } else if (task.status === 'SUCCESS') {
                          pct = 100;
                          stageText = 'Completed';
                        } else if (task.status === 'FAILED') {
                          pct = 100;
                          stageText = 'Generation Failed';
                        }

                        return (
                          <div
                            key={task.taskId}
                            className={`queue-card ${isProcessing ? 'processing' : ''} queue-card-layout`}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                              <div className="queue-info">
                                <h4 className="queue-title">{task.prompt}</h4>
                                <span className="queue-prompt">Task ID: {task.taskId}</span>
                              </div>
                              <div className="queue-status-area">
                                {task.status !== 'SUCCESS' && task.status !== 'FAILED' ? (
                                  <i className="fa-solid fa-circle-notch fa-spin queue-spinner"></i>
                                ) : null}
                                <span className={`queue-status-text ${badgeClass}`}>{task.status}</span>
                              </div>
                            </div>

                            {/* Visual Progress Bar Section */}
                            <div style={{ width: '100%' }}>
                              <div className="queue-progress-header">
                                <span>{stageText}</span>
                                <span style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>{pct}%</span>
                              </div>
                              <div className="queue-progress-bar-container">
                                <div style={{ 
                                  width: `${pct}%`, 
                                  height: '100%', 
                                  background: task.status === 'FAILED' ? 'var(--accent-rose)' : 'linear-gradient(to right, var(--accent-purple), var(--accent-cyan))', 
                                  borderRadius: '3px',
                                  transition: 'width 0.8s ease-in-out' 
                                }}></div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </main>
      </div>

      {/* Settings Modal Component */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fa-solid fa-sliders"></i> API Configuration</h3>
              <button className="close-btn" onClick={() => setShowSettings(false)}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-info">
                This project uses the third-party API service at <a href="https://sunoapi.org" target="_blank" rel="noopener noreferrer">sunoapi.org</a>. You need an API token to generate tracks.
              </p>

              <div className="form-group">
                <label htmlFor="api-key-input">Suno API Key (Bearer Token)</label>
                <div className="input-with-icon">
                  <input
                    type={showKeyText ? "text" : "password"}
                    id="api-key-input"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Bearer suno_api_..."
                  />
                  <button
                    type="button"
                    className="input-inner-btn"
                    onClick={() => setShowKeyText(!showKeyText)}
                  >
                    <i className={`fa-solid ${showKeyText ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
                <span className="field-help">Your key is stored securely in your browser's local storage and is never sent to any external server except our local backend proxy.</span>
              </div>

              {envNoticeVisible && (
                <div className="notice-box">
                  <i className="fa-solid fa-circle-check"></i>
                  <span>A Suno API key is pre-configured on the backend server (`.env.local` file). You do not need to enter one here unless you want to override it.</span>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="primary-btn"
                onClick={() => {
                  localStorage.setItem('suno_api_key', apiKey.trim());
                  setShowSettings(false);
                }}
              >
                Save Configurations
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Lyrics Writer Modal */}
      {showLyricsWriter && (
        <div className="modal-overlay" onClick={() => setShowLyricsWriter(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fa-solid fa-pen-fancy"></i> AI Lyrics Writer</h3>
              <button className="close-btn" onClick={() => setShowLyricsWriter(false)}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="lyrics-prompt-input">What should the song be about?</label>
                <textarea
                  id="lyrics-prompt-input"
                  value={lyricsPrompt}
                  onChange={(e) => setLyricsPrompt(e.target.value)}
                  placeholder="e.g. A melancholic song about rain falling on neon streets, longing, and passage of time."
                />
              </div>

              {isGeneratingLyrics && (
                <div className="loading-state">
                  <i className="fa-solid fa-compact-disc fa-spin"></i>
                  <span>Weaving lines... This might take 30-45 seconds (lyrics endpoints are asynchronous).</span>
                </div>
              )}

              {generatedLyricsResult && (
                <div className="form-group">
                  <label htmlFor="lyrics-result-textarea">Generated Lyrics</label>
                  <textarea id="lyrics-result-textarea" readOnly value={generatedLyricsResult}></textarea>
                </div>
              )}
            </div>
            <div className="modal-footer">
              {!isGeneratingLyrics && !generatedLyricsResult && (
                <button className="primary-btn" onClick={handleLyricsRequest}>Generate Lyrics</button>
              )}
              {generatedLyricsResult && (
                <button
                  className="primary-btn glow-btn"
                  onClick={() => {
                    setCustomLyrics(generatedLyricsResult);
                    setShowLyricsWriter(false);
                  }}
                >
                  Auto-Fill in Console
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lyrics Viewer Modal */}
      {showLyricsViewer && (
        <div className="modal-overlay" onClick={() => setShowLyricsViewer(false)}>
          <div className="modal-card lyrics-view-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{viewingSongLyrics.title} - Lyrics</h3>
              <button className="close-btn" onClick={() => setShowLyricsViewer(false)}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="modal-body">
              <pre className="lyrics-pre">{viewingSongLyrics.text}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Progressive Download Toast */}
      {downloadInfo.show && (
        <div className="download-toast">
          <div className="download-toast-header">
            <span>
              {downloadInfo.status === 'starting' && <i className="fa-solid fa-circle-notch fa-spin download-toast-spinner"></i>}
              {downloadInfo.status === 'downloading' && <i className="fa-solid fa-cloud-arrow-down fa-bounce download-toast-spinner"></i>}
              {downloadInfo.status === 'completed' && <i className="fa-solid fa-circle-check download-toast-success-icon"></i>}
              {downloadInfo.status === 'error' && <i className="fa-solid fa-triangle-exclamation" style={{ color: 'var(--accent-rose)' }}></i>}
              &nbsp;&nbsp;
              {downloadInfo.status === 'starting' && 'Starting download...'}
              {downloadInfo.status === 'downloading' && 'Downloading audio file...'}
              {downloadInfo.status === 'completed' && 'Download Complete!'}
              {downloadInfo.status === 'error' && 'Redirecting to file...'}
            </span>
            {(downloadInfo.status === 'completed' || downloadInfo.status === 'error') && (
              <button 
                className="close-btn" 
                style={{ fontSize: '14px' }}
                onClick={() => setDownloadInfo(prev => ({ ...prev, show: false }))}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            )}
          </div>
          <div className="download-toast-title" title={downloadInfo.title}>
            {downloadInfo.title}
          </div>
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              <span>{downloadInfo.status === 'error' ? 'Redirected' : `${downloadInfo.progress}%`}</span>
              <span>{downloadInfo.status === 'completed' ? 'Saved' : 'Streaming'}</span>
            </div>
            <div style={{ width: '100%', height: '4px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ 
                width: `${downloadInfo.progress}%`, 
                height: '100%', 
                background: downloadInfo.status === 'error' ? 'var(--accent-rose)' : 'linear-gradient(to right, var(--accent-purple), var(--accent-cyan))', 
                borderRadius: '2px',
                transition: 'width 0.1s linear' 
              }}></div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Side Navigation Drawer */}
      <div 
        className={`mobile-drawer-overlay ${showMobileDrawer ? 'active' : ''}`}
        onClick={() => setShowMobileDrawer(false)}
      >
        <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
          <div className="mobile-drawer-header">
            <div className="logo-area">
              <div className="logo-icon" style={{ width: '36px', height: '36px', fontSize: '18px' }}>
                <i className="fa-solid fa-wave-square"></i>
              </div>
              <div className="logo-text">
                <h1 style={{ fontSize: '18px', fontWeight: '800' }}>AetherSynth</h1>
              </div>
            </div>
            <button className="close-btn" onClick={() => setShowMobileDrawer(false)}>
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
          
          <div className="mobile-drawer-body">
            <div className="drawer-section">
              <label>Connection Status</label>
              <div 
                className={`status-badge ${(apiKey || hasServerKey) ? 'status-connected' : 'status-disconnected'}`} 
                style={{ marginTop: '8px', justifyContent: 'center', width: '100%' }}
              >
                <span className="dot"></span>
                <span className="status-label">
                  {(apiKey || hasServerKey) ? (apiKey ? 'Local Key Ready' : 'Server Key Connected') : 'API Key Missing'}
                </span>
              </div>
            </div>

            <div className="drawer-section">
              <label>Configurations</label>
              <button 
                className="primary-btn glow-btn" 
                style={{ width: '100%', marginTop: '8px' }} 
                onClick={() => {
                  setShowMobileDrawer(false);
                  setShowSettings(true);
                }}
              >
                <i className="fa-solid fa-sliders"></i>
                <span>API Settings</span>
              </button>
            </div>

            <div className="drawer-footer">
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>AetherSynth v1.2 • Next.js Edition</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
