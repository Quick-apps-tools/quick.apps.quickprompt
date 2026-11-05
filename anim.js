/* Scrolling and keyboard controls for QuickPrompter. */
(function () {
    "use strict";

    window.initPrompterControls = function (options) {
        const lyrics = options.lyrics;
        const prompter = options.prompter;
        const onHome = options.onHome || function () {};

        let speed = 24; // Keeps held-arrow scrolling at its existing 60 px/s.
        let direction = 2; // 1 = up, 2 = down
        let isMoving = false;
        let scrollMode = "none"; // "arrow" while an arrow key is held; "auto" for number keys
        let animationFrame = null;
        let lastTime = 0;

        const speedMap = {
            97: 30, 98: 40, 99: 60, 100: 80, 101: 100,
            102: 120, 103: 140, 104: 160, 105: 180,
            49: 30, 50: 40, 51: 60, 52: 80, 53: 100,
            54: 120, 55: 140, 56: 160, 57: 180
        };

        function stopScrolling() {
            isMoving = false;
            scrollMode = "none";
            if (animationFrame !== null) {
                cancelAnimationFrame(animationFrame);
                animationFrame = null;
            }
            lastTime = 0;
        }

        function loop(timestamp) {
            if (!isMoving) {
                animationFrame = null;
                lastTime = 0;
                return;
            }

            const delta = Math.min(Math.max(timestamp - lastTime, 0), 50);
            lastTime = timestamp;

            // Keep key 1 at its previous speed; keys 2–9 rise in gradual steps.
            const movement = speed * 2.5 * (delta / 1000);
            const signedMovement = direction === 2 ? movement : -movement;
            const maxScroll = Math.max(0, lyrics.scrollHeight - lyrics.clientHeight);
            const nextPosition = Math.max(0, Math.min(maxScroll, lyrics.scrollTop + signedMovement));
            lyrics.scrollTop = nextPosition;

            if ((nextPosition <= 0 && direction === 1) || (nextPosition >= maxScroll && direction === 2)) {
                stopScrolling();
                return;
            }
            animationFrame = requestAnimationFrame(loop);
        }

        function startScrolling() {
            if (isMoving) return;
            isMoving = true;
            lastTime = performance.now();
            animationFrame = requestAnimationFrame(loop);
        }

        function handleKeys(event) {
            if (prompter.style.display !== "block") return;
            const key = event.keyCode;

            if (event.ctrlKey && (key === 66 || event.key.toLowerCase() === "b")) {
                event.preventDefault();
                stopScrolling();
                onHome();
                return;
            }

            if (key === 27) {
                event.preventDefault();
                stopScrolling();
                lyrics.scrollTo({ top: 0, behavior: "smooth" });
                return;
            }

            if (key === 32 || key === 13 || key === 96 || key === 48) {
                if (isMoving) stopScrolling();
                event.preventDefault();
                return;
            }

            // Arrow Down is the immediate stop key during number-key auto-scroll.
            if (key === 40 && isMoving && scrollMode === "auto") {
                event.preventDefault();
                stopScrolling();
                return;
            }

            if (speedMap[key]) {
                speed = speedMap[key];
                direction = 2;
                scrollMode = "auto";
                startScrolling();
                event.preventDefault();
                return;
            }

            if (key === 38 || key === 40) {
                // Ignore OS key-repeat. The matching keyup event stops the held scroll.
                if (event.repeat) {
                    event.preventDefault();
                    return;
                }
                direction = key === 38 ? 1 : 2;
                scrollMode = "arrow";
                startScrolling();
                event.preventDefault();
            }
        }

        function handleKeyUp(event) {
            if (prompter.style.display !== "block") return;
            if ((event.keyCode === 38 || event.keyCode === 40) && scrollMode === "arrow") {
                event.preventDefault();
                stopScrolling();
            }
        }

        window.addEventListener("keydown", handleKeys, true);
        window.addEventListener("keyup", handleKeyUp, true);
        prompter.addEventListener("mousedown", stopScrolling);

        return stopScrolling;
    };
})();
