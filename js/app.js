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
    const btnRestart = document.getElementById('btn-restart');
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

    // Default demo script - original speed reading video transcript
    const DEFAULT_SCRIPT = `@wpm 300
Let's see if you can keep up with this speed reading exercise. We'll kick things off at 300 words per minute. The average person reads around 200 to 250 words per minute, so you're already reading faster than most people. Anyway, let's give 360 words per minute a try.

@wpm 360
The main trick with this kind of speed reading is all about quieting the voice in your head. This voice reads every single word aloud. That's the main habit that slows us all down. Think of it like taking the training wheels off a bike. At first it feels strange, but soon you find your balance.

The idea here is your eyes do the work. Just absorb the words as they appear on screen. Most of us learned to read at a certain pace and just never updated that skill. So how does this actually work?

The technique we're using is called Rapid Serial Visual Presentation. The idea behind it is really simple. Instead of your eyes having to move across a page, the words are rapidly presented to you one at a time.

@wpm 450
Your eyes don't move smoothly when you read normally. They make tiny jumps and stops. These small movements are what take up most of your reading time.

By getting rid of them, you naturally start to process information much faster. You'll notice there's a red letter in each word. That's your focal point. It acts as an anchor for your eyes. This helps your brain to lock onto the word and recognize it almost instantly. You don't need to scan the whole thing.

It's a cool trick that makes a huge difference. Before we got artificial intelligence to do our work for us, speed reading was a key skill. Even if it's not as vital now, it's still a fun little cognitive workout.

It helps you learn faster and enjoy reading more. With consistent practice, you can train your brain to process information at a much higher rate.

@wpm 600
Start with a comfortable speed and gradually increase it. The goal is not just to see words, but to absorb their meaning effortlessly.

You might be surprised at how quickly your reading speed and comprehension can improve. Think of this as a complete workout for your brain. You're training several key skills at once. For starters, you're building serious focus. To keep up with this speed, your brain has to lock in and ignore distractions. It's like a form of meditation.

You are literally training your attention muscle. It also exercises your working memory when you're pushing to connect ideas more rapidly. Your visual processing also gets a massive upgrade. You train your brain to see whole words as pictures, not just letters.

And maybe most importantly, you're practicing self-control by actively telling that reading voice in your head to stay quiet. This can even make reading less tiring over long periods.

@wpm 900
But here's the most important thing to remember: it only counts if you understand what you're reading. Speed is great, but comprehension is the real goal.

Push the speed. Check in with yourself. After a long paragraph, pause and ask yourself what you just read. If you can't say, you're going too fast.

The aim is to find that sweet spot where you're reading faster than ever but missing nothing. If you can read this, then you're doing pretty well.

Your brain has switched from reading to predicting. You are no longer processing each word individually. Instead, you are using the context of the previous words to anticipate what comes next.

Your brain confirms its guess as the next word flashes into view. It's the same way you can finish a friend's sentence or know the next note in a song you love.

You are witnessing your brain's amazing pattern-matching ability.

Operating at an elite level. This is a powerful demonstration of neuroplasticity. Your mind is literally building faster pathways in real time.

As a reward for taking on this challenge, I would love to hear about your experience. Was it just a blur, or could you pick out key phrases? At what point did it feel like you were guessing instead of reading?

Let everyone know your top speed in the comments. Please like the video, subscribe for more brain workouts, and share your results.

Thank you again for watching, and I will see you in the next one.`;

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
        },
        onStateChange: (playing) => {
            updatePlayButton(playing);
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
        rsvp.load(text);
    }

    // Check URL params for shared script
    const urlParams = new URLSearchParams(window.location.search);
    const pasteURL = urlParams.get('paste');
    const scriptB64 = urlParams.get('script');

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
                    .catch(() => loadScript(DEFAULT_SCRIPT));
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
                .catch(() => loadScript(DEFAULT_SCRIPT));
        }
    } else {
        // Default: load from file
        fetch('scripts/demo.txt')
            .then(response => response.ok ? response.text() : Promise.reject('File not found'))
            .then(text => loadScript(text))
            .catch(err => {
                console.log('Loading inline script:', err);
                loadScript(DEFAULT_SCRIPT);
            });
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

    // Restart button
    btnRestart.addEventListener('click', () => {
        resetPlayback();
        rsvp.restart();
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

        // For short scripts, use inline base64 (encode unicode safely)
        const encoded = btoa(unescape(encodeURIComponent(text)));
        const url = base + '?script=' + encoded;
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
                const url = base + '?paste=' + encodeURIComponent(pasteUrl.trim());
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
                resetPlayback();
                rsvp.restart();
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
