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

    // Initialize audio engines
    const binaural = new BinauralEngine();
    const binaural2 = new HybridBinauralEngine();
    const noise = new NoiseEngine();

    // Track audio state for pause/resume
    let audioState = {
        binaural: { active: false, carrier: 300, beat: 10, volume: 0 },
        binaural2: { active: false, carrier1: 312.5, beat1: 5, carrier2: null, beat2: null, volume: 0, iso: false, interleave: 0, band2Mix: 0.5 },
        noise: { active: false, volume: 0 }
    };

    // Flag to skip audio stop during snap pauses
    let isSnapPause = false;

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
            // Auto-stop audio effects
            binaural.stop(2);
            binaural2.stop(2);
            noise.stop(2);
        },
        onStateChange: (playing) => {
            updatePlayButton(playing);
            if (!playing && !isSnapPause) {
                // Pause - fade out but keep state (skip if snap pause)
                binaural.stop(0.5);
                binaural2.stop(0.5);
                noise.stop(0.5);
            } else if (playing) {
                // Resume - restore audio if it was active (and not already playing)
                // Pass explicit short fadeIn (0.5s) for quick resume
                if (audioState.binaural.active && audioState.binaural.volume > 0 && !binaural.isPlaying) {
                    binaural.start(
                        audioState.binaural.carrier,
                        audioState.binaural.beat,
                        0.5,  // fade for freq changes
                        0.5,  // fadeIn - quick resume
                        audioState.binaural.volume
                    );
                }
                if (audioState.binaural2.active && audioState.binaural2.volume > 0 && !binaural2.isPlaying) {
                    binaural2.start(
                        audioState.binaural2.carrier1,
                        audioState.binaural2.beat1,
                        audioState.binaural2.carrier2,
                        audioState.binaural2.beat2,
                        {
                            fade: 0.5,
                            fadeIn: 0.5,
                            volume: audioState.binaural2.volume,
                            isoRate: audioState.binaural2.isoRate,
                            band2Mix: audioState.binaural2.band2Mix
                        }
                    );
                }
                if (audioState.noise.active && audioState.noise.volume > 0 && !noise.isPlaying) {
                    noise.start(audioState.noise.volume, 0.5);
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
        onSnap: (pauseDuration) => {
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

            // Blank the display during pause
            wordBefore.textContent = '';
            wordORP.textContent = '';
            wordAfter.textContent = '';
            wordContainer.style.marginLeft = '0';

            // Pause playback, then resume after delay
            // Set flag so audio doesn't stop during snap
            isSnapPause = true;
            rsvp.pause();
            setTimeout(() => {
                isSnapPause = false;
                rsvp.play();
            }, pauseDuration);
        },
        onBinaural: (args) => {
            const params = BinauralEngine.parseCommand(args);
            if (params.action === 'off') {
                binaural.stop(params.fade);
                audioState.binaural.active = false;
                audioState.binaural.volume = 0;
            } else {
                binaural.start(params.carrier, params.beat, params.fade, params.fadeIn, params.volume);
                audioState.binaural = {
                    active: true,
                    carrier: params.carrier,
                    beat: params.beat,
                    volume: params.volume
                };
            }
        },
        onBinaural2: (args) => {
            const params = HybridBinauralEngine.parseCommand(args);
            if (params.action === 'off') {
                binaural2.stop(params.fade);
                audioState.binaural2.active = false;
                audioState.binaural2.volume = 0;
            } else {
                binaural2.start(
                    params.carrier1, params.beat1,
                    params.carrier2, params.beat2,
                    {
                        fade: params.fade,
                        fadeIn: params.fadeIn,
                        volume: params.volume,
                        iso: params.iso,
                        interleave: params.interleave,
                        band2Mix: params.band2Mix
                    }
                );
                audioState.binaural2 = {
                    active: true,
                    carrier1: params.carrier1,
                    beat1: params.beat1,
                    carrier2: params.carrier2,
                    beat2: params.beat2,
                    volume: params.volume,
                    iso: params.iso,
                    interleave: params.interleave,
                    band2Mix: params.band2Mix
                };
            }
        },
        onNoise: (args) => {
            const params = NoiseEngine.parseCommand(args);
            if (params.action === 'off') {
                noise.stop(params.fade);
                audioState.noise.active = false;
                audioState.noise.volume = 0;
            } else {
                noise.start(params.volume, params.fade);
                audioState.noise = { active: true, volume: params.volume };
            }
        }
    });

    // Load default script from external file (falls back to inline if fetch fails)
    fetch('scripts/demo.txt')
        .then(response => response.ok ? response.text() : Promise.reject('File not found'))
        .then(text => {
            scriptEditor.value = text;
            loadedScript = text;
            rsvp.load(text);
        })
        .catch(err => {
            console.log('Loading inline script:', err);
            scriptEditor.value = DEFAULT_SCRIPT;
            loadedScript = DEFAULT_SCRIPT;
            rsvp.load(DEFAULT_SCRIPT);
        });

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

    // Event Listeners

    // Play/Pause button
    btnPlay.addEventListener('click', () => {
        rsvp.toggle();
    });

    // Restart button
    btnRestart.addEventListener('click', () => {
        // Stop effects on restart
        spiral.stop(0.3);
        subliminals.stop(0.3);
        binaural.stop(0.3);
        binaural2.stop(0.3);
        noise.stop(0.3);
        // Reset audio state
        audioState.binaural = { active: false, carrier: 300, beat: 10, volume: 0 };
        audioState.binaural2 = { active: false, carrier1: 312.5, beat1: 5, carrier2: null, beat2: null, volume: 0, isoRate: 0, band2Mix: 0.5 };
        audioState.noise = { active: false, volume: 0 };
        rsvp.restart();
    });

    // Fullscreen button - use native APIs when available
    async function enterFullscreen() {
        const container = document.getElementById('rsvp-container');

        // Try native fullscreen API first
        try {
            if (container.requestFullscreen) {
                await container.requestFullscreen();
            } else if (container.webkitRequestFullscreen) {
                await container.webkitRequestFullscreen();
            } else if (container.msRequestFullscreen) {
                await container.msRequestFullscreen();
            }
        } catch (e) {
            console.log('Fullscreen API not available');
        }

        // Try to lock orientation to landscape (Android only, iOS ignores this)
        try {
            if (screen.orientation && screen.orientation.lock) {
                await screen.orientation.lock('landscape');
            }
        } catch (e) {
            console.log('Orientation lock not available');
        }

        document.body.classList.add('fullscreen');
    }

    function exitFullscreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }

        // Unlock orientation
        try {
            if (screen.orientation && screen.orientation.unlock) {
                screen.orientation.unlock();
            }
        } catch (e) {}

        document.body.classList.remove('fullscreen');
    }

    function toggleFullscreen() {
        if (document.body.classList.contains('fullscreen')) {
            exitFullscreen();
        } else {
            enterFullscreen();
        }
    }

    // Listen for native fullscreen changes (e.g., Escape key)
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
            document.body.classList.remove('fullscreen');
        }
    });
    document.addEventListener('webkitfullscreenchange', () => {
        if (!document.webkitFullscreenElement) {
            document.body.classList.remove('fullscreen');
        }
    });

    btnFullscreen.addEventListener('click', toggleFullscreen);

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

    // Track loaded script to detect changes
    let loadedScript = '';

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
            // Stop any running effects
            spiral.stop(0.3);
            subliminals.stop(0.3);
            binaural.stop(0.3);
            binaural2.stop(0.3);
            noise.stop(0.3);
            // Reset audio state
            audioState.binaural = { active: false, carrier: 300, beat: 10, volume: 0 };
            audioState.binaural2 = { active: false, carrier1: 312.5, beat1: 5, carrier2: null, beat2: null, volume: 0, isoRate: 0, band2Mix: 0.5 };
            audioState.noise = { active: false, volume: 0 };
            rsvp.load(text);
            loadedScript = scriptEditor.value;
            updateLoadButton();
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ignore if typing in script editor
        if (e.target === scriptEditor) return;

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                rsvp.toggle();
                break;
            case 'KeyR':
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
                toggleFullscreen();
                break;
        }
    });

    // Double-click RSVP container for fullscreen
    document.getElementById('rsvp-container').addEventListener('dblclick', toggleFullscreen);

    // Click anywhere in fullscreen to exit (but not on the container itself)
    document.addEventListener('click', (e) => {
        if (document.body.classList.contains('fullscreen') &&
            !e.target.closest('#rsvp-container')) {
            exitFullscreen();
        }
    });

    // Initial display
    wpmDisplay.textContent = '300 wpm';
});
