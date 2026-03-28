const { Engine, Render, Runner, Bodies, Composite, Mouse, MouseConstraint } = Matter;

let activeEngines = [];
let activeRunners = [];
let animationFrameId = null;

// Global mouse tracker for attraction effect
let globalMouse = { x: -1000, y: -1000 };
const indicator = document.getElementById('gravity-indicator');

function updateIndicator(x, y, active) {
    if (!indicator) return;
    indicator.style.left = x + 'px';
    indicator.style.top = y + 'px';
    if (active) indicator.classList.add('active');
    else indicator.classList.remove('active');
}

window.addEventListener('mousemove', (e) => {
    globalMouse.x = e.clientX;
    globalMouse.y = e.clientY;
    updateIndicator(e.clientX, e.clientY, true);
});

// Listen for mouse messages from parent (Visual Editor)
window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'HEARTBEAT_MOUSE') {
        globalMouse.x = e.data.x;
        globalMouse.y = e.data.y;
        updateIndicator(e.data.x, e.data.y, true);
    }
});

// Hide indicator when mouse leaves window
window.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget && indicator) indicator.classList.remove('active');
});

window.destroyPhysics = function() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    activeRunners.forEach(r => Runner.stop(r));
    activeEngines.forEach(e => Engine.clear(e));
    activeEngines = [];
    activeRunners = [];
    
    // Remove the tracking canvases
    document.querySelectorAll('.physics-area canvas').forEach(c => c.remove());
};

window.initPhysics = function() {
    initPhysicsCard('services-physics');
    initPhysicsCard('tools-physics');
};

window.updatePhysicsParams = function(params) {
    if (!params) return;
    if (window.BENTO_PHYSICS) {
        Object.assign(window.BENTO_PHYSICS, params);
    } else {
        window.BENTO_PHYSICS = params;
    }
    // Easiest way to apply is to restart physics with new params
    window.destroyPhysics();
    window.initPhysics();
};

function initPhysicsCard(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Create a transparent canvas just for Matter's mouse to bind onto seamlessly.
    // It captures interactions right over the DOM without breaking absolute positioning.
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none'; // We actually let mouse fall through
    canvas.style.zIndex = '1';
    container.appendChild(canvas);

    let width = container.clientWidth || 300;
    let height = container.clientHeight || 300;
    container.style.setProperty('--card-w', width + 'px');

    const engine = Engine.create();
    const world = engine.world;
    activeEngines.push(engine);
    
    // Default params that match visual-editor expectations
    const defaults = { gravity: 1.0, gravityScale: 0.001, restitution: 0.7, frictionAir: 0.05 };
    const params = Object.assign({}, defaults, window.BENTO_PHYSICS);

    // Apply custom settings
    engine.gravity.y = (params.gravity !== undefined) ? params.gravity : 1.0;
    if (params.gravityScale !== undefined) engine.gravity.scale = params.gravityScale;

    // Static Boundaries bounds - THICK to prevent escape
    const ground = Bodies.rectangle(width / 2, height + 500, width * 10, 1000, { isStatic: true });
    const wallLeft = Bodies.rectangle(-500, height / 2, 1000, height * 10, { isStatic: true });
    const wallRight = Bodies.rectangle(width + 500, height / 2, 1000, height * 10, { isStatic: true });
    const roof = Bodies.rectangle(width / 2, -1000, width * 10, 2000, { isStatic: true });

    Composite.add(world, [ground, wallLeft, wallRight, roof]);

    const domItems = container.querySelectorAll('.physics-item');
    const bodies = [];

    domItems.forEach((el, index) => {
        const isIcon = el.classList.contains('tool-icon');
        // Capture actual dimensions from the DOM!
        let w = el.getBoundingClientRect().width || (isIcon ? 60 : 80);
        let h = el.getBoundingClientRect().height || (isIcon ? 60 : 38);
        
        // Slightly buffer dimensions to prevent text clipping
        w += 2;
        h += 2;

        // Start them scattered near the top to fall down nicely
        const randomX = Math.random() * (width - w) + w / 2;
        const startY = -(Math.random() * 300) - h; // Drop from just above

        let body;
        if (isIcon) {
            body = Bodies.rectangle(randomX, startY, w, h, {
                restitution: params.restitution || 0.6,
                frictionAir: params.frictionAir || 0.05,
                chamfer: { radius: w * 0.3 } 
            });
        } else {
            // Pill - ensure chamfer is safe
            const chamferRadius = Math.min(h / 2, w / 2, 19);
            body = Bodies.rectangle(randomX, startY, w, h, {
                restitution: params.restitution || 0.6,
                frictionAir: params.frictionAir || 0.05,
                chamfer: { radius: chamferRadius }
            });
        }

        // Attach DOM element reference directly to body
        body.domElement = el;
        bodies.push(body);
        
        // Make sure it starts smoothly and is visible
        el.style.zIndex = '2'; 
        el.style.position = 'absolute';
        el.style.top = '0';
        el.style.left = '0';
        el.style.opacity = '1';
    });

    Composite.add(world, bodies);

    // MOUSE INTERACTION SETUP
    // Matter needs a mouse to grab bodies
    const mouse = Mouse.create(container);
    const mouseConstraint = MouseConstraint.create(engine, {
        mouse: mouse,
        constraint: {
            stiffness: 0.2,
            render: { visible: false }
        }
    });

    Composite.add(world, mouseConstraint);
    
    // ATTRACTION LOGIC
    Matter.Events.on(engine, 'beforeUpdate', () => {
        const rect = container.getBoundingClientRect();
        // Convert global client coords to container-local coords
        const localMouseX = (globalMouse.x - rect.left);
        const localMouseY = (globalMouse.y - rect.top);

        bodies.forEach(body => {
            const dx = localMouseX - body.position.x;
            const dy = localMouseY - body.position.y;
            const distanceSq = dx * dx + dy * dy;
            const distance = Math.sqrt(distanceSq);
            
            // Toggle indicator visibility based on params
            const isVisible = (params.showIndicator !== 0);
            updateIndicator(globalMouse.x, globalMouse.y, isVisible);

            if (distance > 1 && distance < 1500) {
                // Use custom strength from params
                const strength = params.attractionStrength || 0.0008;
                let forceMagnitude = strength * body.mass;
                
                // Safety clamp to prevent breaking through walls
                const maxForce = 0.05 * body.mass;
                if (forceMagnitude > maxForce) forceMagnitude = maxForce;

                Matter.Body.applyForce(body, body.position, {
                    x: (dx / distance) * forceMagnitude,
                    y: (dy / distance) * forceMagnitude
                });
            }
        });
    });

    // Keep the mouse in sync with scrolling
    mouseConstraint.mouse.element.removeEventListener("mousewheel", mouseConstraint.mouse.mousewheel);
    mouseConstraint.mouse.element.removeEventListener("DOMMouseScroll", mouseConstraint.mouse.mousewheel);

    // Sync loop: Engine updates -> DOM updates
    function updateDOM() {
        bodies.forEach(body => {
            const el = body.domElement;
            if (!el) return;
            const x = body.position.x - el.offsetWidth / 2;
            const y = body.position.y - el.offsetHeight / 2;
            
            // Skip invalid positions
            if (isNaN(x) || isNaN(y)) return;
            
            // Translate + rotate exactly to the physics bodies!
            el.style.transform = `translate(${x}px, ${y}px) rotate(${body.angle}rad)`;
        });
        animationFrameId = requestAnimationFrame(updateDOM);
    }
    
    animationFrameId = requestAnimationFrame(updateDOM);

    // Start Engine
    const runner = Runner.create();
    Runner.run(runner, engine);
    activeRunners.push(runner);

    // Handle resize
    window.addEventListener('resize', () => {
        width = container.clientWidth;
        height = container.clientHeight;
        container.style.setProperty('--card-w', width + 'px');
        
        Matter.Body.setPosition(ground, { x: width / 2, y: height + 500 });
        Matter.Body.setPosition(wallRight, { x: width + 500, y: height / 2 });
    });
}

// Ensure DOM is fully loaded and layout has run before parsing widths
window.addEventListener('load', () => {
    // Only init if it hasn't been initialized by bento-script.js data load yet
    if (activeEngines.length === 0) {
        window.initPhysics();
    }
});
