/**
 * SpeedWashing - Main Application
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const wordContainer = document.getElementById('word-container');
    const wordBefore = document.getElementById('word-before');
    const wordORP = document.getElementById('word-orp');
    const wordAfter = document.getElementById('word-after');
    const wpmDisplay = document.getElementById('wpm-display');

    const btnPlay = document.getElementById('btn-play');
    const btnRewind = document.getElementById('btn-rewind');
    const btnLoop = document.getElementById('btn-loop');
    const btnFullscreen = document.getElementById('btn-fullscreen');
    const wpmSlider = document.getElementById('wpm-slider');
    const wpmValue = document.getElementById('wpm-value');
    const btnSync = document.getElementById('btn-sync');

    const scriptEditor = document.getElementById('script-editor');
    const btnLoadScript = document.getElementById('btn-load-script');
    const btnShare = document.getElementById('btn-share');

    const progressBar = document.getElementById('progress-bar');
    const wordCount = document.getElementById('word-count');

    // Initialize spiral effect
    const spiralCanvas = document.getElementById('spiral-canvas');
    const spiral = new SpiralEffect(spiralCanvas);

    // Audio elements
    const snapSound = document.getElementById('snap-sound');
    const flashOverlay = document.getElementById('flash-overlay');

    // Initialize subliminals
    const subliminalTop = document.getElementById('subliminal-top');
    const subliminalBottom = document.getElementById('subliminal-bottom');
    const subliminals = new SubliminalEngine(subliminalTop, subliminalBottom);

    // Initialize audio engine (handles binaural, isochronic, hybrid)
    const binaural = new BinauralEngine();

    // Pulse border color map and helpers
    const PULSE_COLORS = {
        green: '#22c55e',    // touch
        yellow: '#eab308',   // get ready
        edge: '#e91e8c',     // edge (raspberry/magenta)
        red: '#ef4444',      // stop / no touching
        purple: '#8B5CF6'    // reserved
    };
    const rsvpContainer = document.getElementById('rsvp-container');

    function parsePulseBorder(args) {
        const tokens = args.trim().split(/\s+/);
        if (tokens[0].toLowerCase() === 'off') {
            let fade = 1;
            for (const t of tokens) {
                if (t.startsWith('fade:')) {
                    const v = parseFloat(t.split(':')[1]);
                    if (Number.isFinite(v)) fade = v;
                }
            }
            return { action: 'off', fade };
        }
        // First token is color (named or hex)
        const colorToken = tokens[0];
        const color = PULSE_COLORS[colorToken.toLowerCase()] || colorToken;
        let hz = 0.33;
        let fade = 1;
        for (const t of tokens.slice(1)) {
            if (t.startsWith('hz:')) {
                const v = parseFloat(t.split(':')[1]);
                if (Number.isFinite(v) && v > 0) hz = v;
            } else if (t.startsWith('fade:')) {
                const v = parseFloat(t.split(':')[1]);
                if (Number.isFinite(v)) fade = v;
            }
        }
        return { action: 'on', color, hz, fade };
    }

    function applyPulseBorder(params) {
        if (params.action === 'off') {
            rsvpContainer.style.setProperty('--pulse-fade', params.fade + 's');
            rsvpContainer.classList.remove('pulsing');
            rsvpContainer.classList.add('pulse-fading');
            // Clean up after fade
            setTimeout(() => {
                rsvpContainer.classList.remove('pulse-fading');
                rsvpContainer.style.removeProperty('--pulse-fade');
            }, params.fade * 1000);
        } else {
            rsvpContainer.classList.remove('pulse-fading');
            rsvpContainer.style.setProperty('--pulse-color', params.color);
            if (rsvpContainer.classList.contains('pulsing')) {
                // Adjust playback rate to match new hz without restarting animation
                const anim = rsvpContainer.getAnimations().find(a => a.animationName === 'pulse-border');
                if (anim) {
                    const baseDuration = parseFloat(rsvpContainer.style.getPropertyValue('--pulse-duration'));
                    anim.playbackRate = baseDuration / (1 / params.hz);
                }
            } else {
                rsvpContainer.style.setProperty('--pulse-duration', (1 / params.hz) + 's');
                rsvpContainer.classList.add('pulsing');
            }
        }
    }

    function resetPulseBorder() {
        rsvpContainer.classList.remove('pulsing', 'pulse-fading');
        rsvpContainer.style.removeProperty('--pulse-color');
        rsvpContainer.style.removeProperty('--pulse-duration');
        rsvpContainer.style.removeProperty('--pulse-fade');
        rsvpContainer.style.boxShadow = '';
    }

    // SFX audio cache — Audio objects keyed by name
    const sfxCache = {};

    function ensureSfx(name) {
        if (!sfxCache[name]) {
            const audio = new Audio();
            audio.src = `audio/sfx/${name}.ogg`;
            audio.onerror = () => {
                // Fallback to mp3 once, then stop retrying
                if (!audio.dataset.fellback) {
                    audio.dataset.fellback = '1';
                    audio.src = `audio/sfx/${name}.mp3`;
                }
            };
            sfxCache[name] = audio;
        }
        return sfxCache[name];
    }

    function playSfx(name, vol = 0.7) {
        const audio = ensureSfx(name);
        audio.volume = vol;
        audio.currentTime = 0;
        audio.play().catch(e => console.log('SFX blocked:', e));
    }

    // Pre-scan script text for @sfx names and populate cache (for iOS priming)
    function prescanSfx(text) {
        const re = /^@sfx\s+(\S+)/gim;
        let m;
        while ((m = re.exec(text)) !== null) {
            ensureSfx(m[1]);
        }
    }

    // Flag to skip audio stop during snap pauses
    let isSnapPause = false;
    let snapTimeoutId = null;

    // iOS audio priming - must start audio within ~4s of user gesture
    let audioPrimed = false;
    async function primeAudioForIOS() {
        if (audioPrimed) return;
        audioPrimed = true;

        try {
            // Init audio context and worklet within gesture timeout
            await binaural.init();
            if (binaural.ctx.state === 'suspended') await binaural.ctx.resume();
            // Poke worklet with a silent layer to prevent iOS from suspending the audio thread.
            // Safe: runs once on first gesture before any user layers are allocated.
            binaural.node.port.postMessage({ layer: 7, gain: 0, fadeTime: 0.01 });
        } catch (e) {
            audioPrimed = false;
            console.error('Audio init failed:', e);
        }

        // Prime snap: play at vol:0 then pause
        if (snapSound) {
            const origVol = snapSound.volume;
            snapSound.volume = 0;
            snapSound.play().then(() => {
                snapSound.pause();
                snapSound.currentTime = 0;
                snapSound.volume = origVol;
            }).catch(() => {}); // Ignore errors
        }

    }

    // Initialize RSVP Engine
    const rsvp = new RSVPEngine({
        wpm: 300,
        onWord: (parts, wordObj) => {
            wordBefore.textContent = parts.before;
            wordORP.textContent = parts.orp;
            wordAfter.textContent = parts.after;
            // Offset so ORP aligns to center guide
            requestAnimationFrame(() => {
                const beforeWidth = wordBefore.offsetWidth;
                const orpWidth = wordORP.offsetWidth;
                wordContainer.style.marginLeft = `-${beforeWidth + orpWidth/2}px`;
            });
        },
        onProgress: (current, total) => {
            const percent = total > 0 ? (current / total) * 100 : 0;
            progressBar.style.width = `${percent}%`;
            wordCount.textContent = `${current} / ${total} words`;
        },
        onWPMChange: (wpm) => {
            wpmDisplay.textContent = `${wpm} wpm`;
            wpmSlider.value = wpm;
            wpmValue.textContent = wpm;
        },
        onComplete: () => {
            updatePlayButton(false);
            spiral.stop(2);
            subliminals.stop(2);
            binaural.stop(2);
            resetPulseBorder();
        },
        onStateChange: (playing) => {
            if (playing || !isSnapPause) {
                updatePlayButton(playing);
            }
            if (!playing && !isSnapPause) {
                // Manual pause - cancel any pending snap resume
                if (snapTimeoutId) {
                    clearTimeout(snapTimeoutId);
                    snapTimeoutId = null;
                }
                // Pause - fade layers to 0 but keep state
                binaural.pauseAll(0.5);
            } else if (playing) {
                // Resume - restore layers
                if (binaural.hasActiveLayers()) {
                    binaural.resumeAll(0.5);
                }
            }
        },
        onSpiral: (args) => {
            const params = SpiralEffect.parseCommand(args);
            if (params.action === 'off') {
                spiral.stop(params.fade);
            } else {
                spiral.start(params.color, params.opacity, params.speed, params.fade);
            }
        },
        onSubliminals: (args) => {
            const params = SubliminalEngine.parseCommand(args);
            if (params.action === 'off') {
                subliminals.stop(params.fade);
            } else {
                subliminals.start(params.opacity, params.fade, params.words);
            }
        },
        onSfx: (name, vol) => {
            playSfx(name, vol);
        },
        onPause: (pauseDuration, pauseWord) => {
            // Display pause word or blank (same as snap, but no sound/flash)
            if (pauseWord) {
                const parts = ORP.split(pauseWord);
                wordBefore.textContent = parts.before;
                wordORP.textContent = parts.orp;
                wordAfter.textContent = parts.after;
                requestAnimationFrame(() => {
                    const beforeWidth = wordBefore.offsetWidth;
                    const orpWidth = wordORP.offsetWidth;
                    wordContainer.style.marginLeft = `-${beforeWidth + orpWidth/2}px`;
                });
            } else {
                wordBefore.textContent = '';
                wordORP.textContent = '';
                wordAfter.textContent = '';
                wordContainer.style.marginLeft = '0';
            }

            // Pause playback, then resume after delay (no sound, no flash)
            isSnapPause = true;
            rsvp.pause();
            snapTimeoutId = setTimeout(() => {
                snapTimeoutId = null;
                if (!isSnapPause) return;
                isSnapPause = false;
                rsvp.play();
            }, pauseDuration);
        },
        onSnap: (pauseDuration, snapWord) => {
            // Play snap sound
            if (snapSound) {
                snapSound.currentTime = 0;
                snapSound.play().catch(e => console.log('Snap audio blocked:', e));
            }

            // White flash
            if (flashOverlay) {
                flashOverlay.style.transition = 'none';
                flashOverlay.style.opacity = '1';
                setTimeout(() => {
                    flashOverlay.style.transition = 'opacity 0.3s ease';
                    flashOverlay.style.opacity = '0';
                }, 50);
            }

            // Display snap word or blank
            if (snapWord) {
                const parts = ORP.split(snapWord);
                wordBefore.textContent = parts.before;
                wordORP.textContent = parts.orp;
                wordAfter.textContent = parts.after;
                requestAnimationFrame(() => {
                    const beforeWidth = wordBefore.offsetWidth;
                    const orpWidth = wordORP.offsetWidth;
                    wordContainer.style.marginLeft = `-${beforeWidth + orpWidth/2}px`;
                });
            } else {
                wordBefore.textContent = '';
                wordORP.textContent = '';
                wordAfter.textContent = '';
                wordContainer.style.marginLeft = '0';
            }

            // Pause playback, then resume after delay
            // Set flag so audio doesn't stop during snap
            isSnapPause = true;
            rsvp.pause();
            snapTimeoutId = setTimeout(() => {
                snapTimeoutId = null;
                if (!isSnapPause) return;  // manual pause cancelled the snap
                isSnapPause = false;
                rsvp.play();
            }, pauseDuration);
        },
        onAudio: (mode, args) => {
            const params = BinauralEngine.parseCommand(mode, args);
            binaural.applyCommand(mode, params);
        },
        onPulseBorder: (args) => {
            const params = parsePulseBorder(args);
            applyPulseBorder(params);
        }
    });

    // Track loaded script to detect changes
    let loadedScript = '';

    // --- Script loading: URL params > external file > inline fallback ---

    // Sanitize fetched script text (strip HTML tags to prevent XSS)
    function sanitizeScript(text) {
        return text.replace(/<[^>]*>/g, '');
    }

    // Normalize a paste URL to its raw content URL
    function toRawURL(url) {
        try {
            const u = new URL(url);
            // GitHub Gist: convert /user/id to raw
            if (u.hostname === 'gist.github.com') {
                if (!u.pathname.endsWith('/raw')) {
                    return url + '/raw';
                }
                return url;
            }
            // Already a raw gist URL
            if (u.hostname === 'gist.githubusercontent.com') {
                return url;
            }
            // Rentry.co: ensure /raw suffix
            if (u.hostname === 'rentry.co' || u.hostname === 'rentry.org') {
                if (!u.pathname.endsWith('/raw')) {
                    return url.replace(/\/?$/, '/raw');
                }
                return url;
            }
            // dpaste.org: ensure /raw suffix
            if (u.hostname === 'dpaste.org') {
                if (!u.pathname.endsWith('/raw')) {
                    return url.replace(/\/?$/, '/raw');
                }
                return url;
            }
            // Generic URL - fetch as-is
            return url;
        } catch (e) {
            return url;
        }
    }

    function loadScript(text) {
        scriptEditor.value = text;
        loadedScript = text;
        prescanSfx(text);
        rsvp.load(text);
    }

    // Check URL params for shared script and options
    const urlParams = new URLSearchParams(window.location.search);
    const pasteURL = urlParams.get('paste');
    const scriptB64 = urlParams.get('script');

    // Apply loop param from URL
    if (urlParams.get('loop') === '1') {
        rsvp.setLoop(true);
        btnLoop.classList.add('loop-active');
    }

    function loadFailed() {
        scriptEditor.placeholder = 'Failed to load script. Paste one above and click Load.';
    }

    if (pasteURL) {
        // Load script from a paste service URL
        const rawURL = toRawURL(pasteURL);
        scriptEditor.placeholder = 'Loading shared script...';
        fetch(rawURL)
            .then(r => {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.text();
            })
            .then(text => loadScript(sanitizeScript(text)))
            .catch(err => {
                console.error('Failed to load shared script:', err);
                scriptEditor.placeholder = 'Failed to load shared script. Loading demo...';
                return fetch('scripts/demo.txt')
                    .then(r => r.ok ? r.text() : Promise.reject())
                    .then(text => loadScript(text))
                    .catch(loadFailed);
            });
    } else if (scriptB64) {
        // Inline base64-encoded script
        try {
            const text = decodeURIComponent(escape(atob(scriptB64)));
            loadScript(sanitizeScript(text));
        } catch (e) {
            console.error('Failed to decode script param:', e);
            fetch('scripts/demo.txt')
                .then(r => r.ok ? r.text() : Promise.reject())
                .then(text => loadScript(text))
                .catch(loadFailed);
        }
    } else {
        // Default: load from file
        fetch('scripts/demo.txt')
            .then(response => response.ok ? response.text() : Promise.reject('File not found'))
            .then(text => loadScript(text))
            .catch(loadFailed);
    }

    // Update play button appearance
    function updatePlayButton(playing) {
        const playIcon = btnPlay.querySelector('.play-icon');
        const pauseIcon = btnPlay.querySelector('.pause-icon');

        if (playing) {
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'inline';
        } else {
            playIcon.style.display = 'inline';
            pauseIcon.style.display = 'none';
        }
    }

    // Shared cleanup for restart / load / R-key
    function resetPlayback(fade = 0.3) {
        if (snapTimeoutId) {
            clearTimeout(snapTimeoutId);
            snapTimeoutId = null;
        }
        isSnapPause = false;
        spiral.stop(fade);
        subliminals.stop(fade);
        binaural.stop(fade);
        resetPulseBorder();
        audioPrimed = false;
    }

    // Helper to copy text to clipboard with prompt fallback
    function copyToClipboard(text, onSuccess) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
                prompt('Copy this URL:', text);
            });
        } else {
            prompt('Copy this URL:', text);
        }
    }

    // Event Listeners

    // Play/Pause button
    btnPlay.addEventListener('click', async () => {
        await primeAudioForIOS();
        rsvp.toggle();
    });

    // Rewind button — jump to start, keep playing if was playing
    btnRewind.addEventListener('click', () => {
        const wasPlaying = rsvp.isPlaying;
        resetPlayback();
        rsvp.restart();
        if (wasPlaying) rsvp.play();
    });

    // Loop button — toggle loop mode
    btnLoop.addEventListener('click', () => {
        const enabled = !rsvp.loop;
        rsvp.setLoop(enabled);
        btnLoop.classList.toggle('loop-active', enabled);
    });

    // Fullscreen button
    btnFullscreen.addEventListener('click', () => {
        document.body.classList.toggle('fullscreen');
    });

    // Helper to update sync button state
    function updateSyncButton(synced) {
        btnSync.classList.toggle('synced', synced);
        btnSync.disabled = synced;
    }

    // WPM slider - unsyncs from script
    wpmSlider.addEventListener('input', (e) => {
        const wpm = parseInt(e.target.value, 10);
        wpmValue.textContent = wpm;
        rsvp.setWPM(wpm);
        rsvp.setFollowScript(false);
        updateSyncButton(false);
        wpmDisplay.textContent = `${wpm} wpm`;
    });

    // Sync button - re-enables following script
    btnSync.addEventListener('click', () => {
        rsvp.setFollowScript(true);
        updateSyncButton(true);
    });

    function updateLoadButton() {
        const isLoaded = scriptEditor.value === loadedScript;
        btnLoadScript.classList.toggle('loaded', isLoaded);
        btnLoadScript.disabled = isLoaded;
    }

    // Detect script editor changes
    scriptEditor.addEventListener('input', updateLoadButton);

    // Load script from editor
    btnLoadScript.addEventListener('click', () => {
        const text = scriptEditor.value.trim();
        if (text) {
            resetPlayback();
            prescanSfx(text);
            rsvp.load(text);
            loadedScript = scriptEditor.value;
            updateLoadButton();
        }
    });

    // Share button - generate a shareable URL
    btnShare.addEventListener('click', () => {
        const text = scriptEditor.value.trim();
        if (!text) return;

        const base = window.location.origin + window.location.pathname;
        const loopSuffix = rsvp.loop ? '&loop=1' : '';

        // For short scripts, use inline base64 (encode unicode safely)
        const encoded = btoa(unescape(encodeURIComponent(text)));
        const url = base + '?script=' + encoded + loopSuffix;
        if (url.length <= 2000) {
            copyToClipboard(url, () => {
                btnShare.textContent = 'Copied!';
                setTimeout(() => { btnShare.textContent = 'Share'; }, 2000);
            });
        } else {
            // For longer scripts, prompt to use a paste service
            const msg = 'Script is too long for a URL.\n\n' +
                'Paste your script to one of these (they support CORS):\n' +
                '  - rentry.co\n' +
                '  - dpaste.org\n' +
                '  - gist.github.com\n\n' +
                'Then share with:\n' +
                base + '?paste=YOUR_PASTE_URL';
            const pasteUrl = prompt(msg);
            if (pasteUrl && pasteUrl.trim()) {
                const url = base + '?paste=' + encodeURIComponent(pasteUrl.trim()) + loopSuffix;
                copyToClipboard(url, () => {
                    btnShare.textContent = 'Copied!';
                    setTimeout(() => { btnShare.textContent = 'Share'; }, 2000);
                });
            }
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ignore if typing in script editor
        if (e.target === scriptEditor) return;

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                primeAudioForIOS().then(() => rsvp.toggle());
                break;
            case 'KeyR':
                {
                    const wasPlaying = rsvp.isPlaying;
                    resetPlayback();
                    rsvp.restart();
                    if (wasPlaying) rsvp.play();
                }
                break;
            case 'KeyL':
                {
                    const enabled = !rsvp.loop;
                    rsvp.setLoop(enabled);
                    btnLoop.classList.toggle('loop-active', enabled);
                }
                break;
            case 'ArrowUp':
                e.preventDefault();
                const upWpm = Math.min(1200, parseInt(wpmSlider.value, 10) + 50);
                wpmSlider.value = upWpm;
                wpmSlider.dispatchEvent(new Event('input'));
                break;
            case 'ArrowDown':
                e.preventDefault();
                const downWpm = Math.max(100, parseInt(wpmSlider.value, 10) - 50);
                wpmSlider.value = downWpm;
                wpmSlider.dispatchEvent(new Event('input'));
                break;
            case 'KeyF':
                document.body.classList.toggle('fullscreen');
                break;
        }
    });

    // Double-click RSVP container for fullscreen
    document.getElementById('rsvp-container').addEventListener('dblclick', () => {
        document.body.classList.toggle('fullscreen');
    });

    // Tap/click in fullscreen to exit (skip buttons/inputs)
    document.addEventListener('click', (e) => {
        if (!document.body.classList.contains('fullscreen')) return;
        if (e.target.closest('button, input, textarea, a, select')) return;
        document.body.classList.remove('fullscreen');
    });

    // Initial display
    wpmDisplay.textContent = '300 wpm';
});
