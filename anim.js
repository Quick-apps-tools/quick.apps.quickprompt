/* Scrolling and keyboard controls for QuickPrompter. */
(function () {
    "use strict";

    window.initPrompterControls = function (options) {
        const lyrics = options.lyrics;
        const prompter = options.prompter;
        const onHome = options.onHome || function () {};

        let speed = 20;
        let direction = 2; // 1 = up, 2 = down
        let isMoving = false;
        let animationFrame = null;
        let lastTime = 0;

        const speedMap = {
            97: 30, 98: 60, 99: 100, 100: 140, 101: 190,
            102: 250, 103: 320, 104: 400, 105: 500,
            49: 30, 50: 60, 51: 100, 52: 140, 53: 190,
            54: 250, 55: 320, 56: 400, 57: 500
        };

        function stopScrolling() {
            isMoving = false;
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

            if (!lastTime) lastTime = timestamp;
            const delta = Math.min(timestamp - lastTime, 50);
            lastTime = timestamp;

            // Same speed scale as the supplied prompter, applied to #lyrics.
            const movement = speed * 5 * (delta / 1000);
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
            stopScrolling();
            isMoving = true;
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

            // The supplied prompter stops when an arrow or pause key is pressed mid-scroll.
            if (key === 32 || key === 40 || key === 38 || key === 13 || key === 96 || key === 48) {
                if (isMoving) {
                    stopScrolling();
                    event.preventDefault();
                    return;
                }
            }

            if (speedMap[key]) {
                speed = speedMap[key];
                direction = 2;
                startScrolling();
                event.preventDefault();
                return;
            }

            if (!isMoving && (key === 38 || key === 40)) {
                direction = key === 38 ? 1 : 2;
                startScrolling();
                event.preventDefault();
            }
        }

        window.addEventListener("keydown", handleKeys, true);
        prompter.addEventListener("mousedown", stopScrolling);

        return stopScrolling;
    };
})();