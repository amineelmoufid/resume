import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue } from "firebase/database";
import { firebaseConfig } from "../data/firebase-config.js";

// ─── Firebase ───
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
let currentRef = ref(db, 'resume');
let activePage = 'resume';
let unsubscribe = null;

let D = {}; // currentData
let selectedSection = null;
let currentSubTab = null;
let zoomScale = 0.55;
let firstLoad = true;
let iframeReady = false;

// ─── Page Switcher ───
const pageSwitcher = document.getElementById('page-switcher');
if (pageSwitcher) {
    pageSwitcher.addEventListener('change', (e) => {
        activePage = e.target.value;
        iframe.src = activePage === 'resume' ? '../tabs/profile.html' : '../tabs/bento.html';
        
        // Reset state
        D = {};
        selectedSection = null;
        currentSubTab = null;
        rightTitle.textContent = 'Select a Section';
        rightPanel.innerHTML = '<div class="empty-state"><div class="empty-icon">✦</div><p>Click any section in the preview to edit its content here.</p></div>';
        
        // Unsubscribe old listener
        if (unsubscribe) unsubscribe();
        
        // Subscribe to new node
        currentRef = ref(db, activePage);
        setupListener();
    });
}


// ─── Tooltip Descriptions ───
const TIPS = {
    fullPageWidth: 'Total width of the resume page in pixels. Affects overall layout scale.',
    colLeftWidth: 'Width of the left column (Profile, Skills, Core Skills).',
    gapLeftMid: 'Horizontal gap between the left column and the middle column.',
    colMidWidth: 'Width of the middle column (Experience, Bio).',
    gapMidRight: 'Horizontal gap between the middle column and the sidebar.',
    sidebarWidth: 'Width of the right sidebar. Auto-calculated from page width minus other columns.',
    headerTitleWidth: 'Maximum width allocated for the resume title in the header.',
    gapHeaderTitleLinks: 'Vertical gap between the title and contact links in the header.',
    headerMarginBottom: 'Space below the header before the 3-column content begins.',
    gapProfileInfo: 'Gap between the profile photo/avatar and the personal info text.',
    gapInfoSkills: 'Gap between personal info and the skills section in the left column.',
    sectionMarginBottom: 'Space below each section heading across all columns.',
    jobMarginBottom: 'Vertical spacing between individual job entries in the experience section.',
    sidebarUnitGap: 'Gap between sidebar sections (Education, Strengths, etc.).',
    mainAreaPaddingLeft: 'Left padding/margin for the entire content area.',
    linksPaddingV: 'Vertical (top/bottom) padding inside each contact link pill.',
    linksPaddingH: 'Horizontal (left/right) padding inside each contact link pill.',
    lineHeight: 'Line height for body text. Lower = tighter lines.',
    letterSpacing: 'Letter spacing for body text. Negative = tighter.',
    baseFs: 'Base font size for body/paragraph text in pixels.',
    headerFs: 'Font size for the main resume title (H1).',
    sectionFs: 'Font size for section headings (Skills, Experience, etc.).',
    jobFs: 'Font size for job title text.'
};

// ─── DOM ───
const leftPanel = document.getElementById('layout-controls');
const rightPanel = document.getElementById('content-editor');
const rightTitle = document.getElementById('right-panel-title');
const viewport = document.getElementById('preview-viewport');
const statusPill = document.getElementById('save-status');
const syncDot = document.querySelector('.stage-title .dot');
const syncLabel = document.getElementById('sync-status');
const zoomLabel = document.getElementById('zoom-level');
const typoBar = document.getElementById('typography-controls');

// ─── Create iframe ───
const iframeWrap = document.getElementById('resume-preview');
const zoomScaler = document.getElementById('zoom-scaler');
const iframe = document.createElement('iframe');
iframe.id = 'resume-iframe';
iframe.src = '../tabs/profile.html';
iframe.style.border = 'none';
iframe.style.display = 'block';
iframe.style.background = '#fff';
zoomScaler.appendChild(iframe);

iframe.addEventListener('load', () => {
    iframeReady = true;
    try {
        const idoc = iframe.contentDocument || iframe.contentWindow.document;
        const overrideStyle = idoc.createElement('style');
        overrideStyle.textContent = `
            html, body {
                overflow: visible !important; min-height: auto !important;
                height: auto !important; display: block !important;
                background: #fff !important; margin: 0 !important; padding: 0 !important;
            }
            .resume-wrapper {
                width: auto !important; height: auto !important;
                overflow: visible !important; display: block !important; cursor: default !important;
            }
            .resume-canvas { margin: 0 !important; box-shadow: none !important; transform: none !important; }
            .download-btn, #download-btn { display: none !important; }
            /* Hover-to-Locate highlight injected from visual editor */
            .ve-hl { outline: 3px solid rgba(79,172,254,0.7) !important; outline-offset: -2px; background: rgba(79,172,254,0.06) !important; transition: outline 0.15s, background 0.15s; }
        `;
        idoc.head.appendChild(overrideStyle);
        const wrapper = idoc.querySelector('.resume-wrapper');
        if (wrapper) { const nw = wrapper.cloneNode(true); wrapper.parentNode.replaceChild(nw, wrapper); }
        
        // Ensure overlays update if iframe scrolls
        idoc.addEventListener('scroll', renderOverlay);
        idoc.defaultView.addEventListener('resize', renderOverlay);

        if(activePage === 'bento') {
            // Give bento elements a moment to layout (physics)
            setTimeout(renderOverlay, 500);
        }
    } catch (e) { console.warn('Iframe inject failed:', e); }
});

const overlay = document.createElement('div');
overlay.id = 'preview-overlay';
zoomScaler.appendChild(overlay);

let dataLoaded = false;

// ─── Data Scrubbing (Firebase doesn't allow 'undefined', NaN, or keys with dots/chars) ───
function scrubData(obj) {
    // 1. Convert to JSON and back to strip undefined/functions
    let clean;
    try {
        clean = JSON.parse(JSON.stringify(obj));
    } catch (e) {
        console.error('JSON Scrub failed:', e);
        return null;
    }

    // 2. Recursively remove invalid keys or NaN/Infinity values
    const finalScrub = (val) => {
        if (val === null) return null;
        if (Array.isArray(val)) return val.map(finalScrub);
        if (typeof val === 'object') {
            const out = {};
            Object.keys(val).forEach(k => {
                // Remove keys with invalid characters for Firebase: . $ # [ ]
                const cleanKey = k.replace(/[\.\$#\[\]]/g, '_');
                if (cleanKey !== k) console.warn(`Renamed invalid key "${k}" to "${cleanKey}"`);
                const scrubbedVal = finalScrub(val[k]);
                if (scrubbedVal !== undefined) out[cleanKey] = scrubbedVal;
            });
            return out;
        }
        // Filter out NaN/Infinity
        if (typeof val === 'number' && !isFinite(val)) return null;
        return val;
    };

    return finalScrub(clean);
}

// ─── Auto-save ───
let saveTimeout;
function triggerSave() {
    if (!dataLoaded) return;
    clearTimeout(saveTimeout);
    statusPill.textContent = 'Saving...';
    statusPill.className = 'status-pill saving';
    saveTimeout = setTimeout(async () => {
        try {
            const cleanD = scrubData(D);
            console.log('Final payload to Firebase:', cleanD);
            await set(currentRef, cleanD);
            statusPill.textContent = 'All synced';
            statusPill.className = 'status-pill';
        } catch (e) {
            console.error('CRITICAL SYNC ERROR:', e);
            statusPill.textContent = 'Sync failed (' + e.message.substring(0, 20) + '...)';
            statusPill.className = 'status-pill error';
        }
    }, 800);
}

// ─── Zoom ───
function getIframeDims() {
    const W = parseFloat(iframe.style.width) || D.layout?.fullPageWidth || 1123;
    const H = parseFloat(iframe.style.height) || 1587;
    return { W, H };
}
function applyZoom() {
    const { W, H } = getIframeDims();
    // 1. Set the transform on the scaler
    zoomScaler.style.transform = `scale(${zoomScale})`;
    
    // 2. Set the dimensions of the spacer (iframeWrap) to the scaled size
    // This defines the scrollable area for the browser
    iframeWrap.style.width = (W * zoomScale) + 'px';
    iframeWrap.style.height = (H * zoomScale) + 'px';
    
    zoomLabel.textContent = Math.round(zoomScale * 100) + '%';
}
function autoFitZoom() {
    const vpW = viewport.clientWidth - 60;
    const vpH = viewport.clientHeight - 60;
    const { W, H } = getIframeDims();
    zoomScale = Math.min(0.9, vpW / W, vpH / H);
    applyZoom();
}

document.getElementById('zoom-in-btn').onclick = () => { zoomScale = Math.min(2, zoomScale + 0.05); applyZoom(); };
document.getElementById('zoom-out-btn').onclick = () => { zoomScale = Math.max(0.15, zoomScale - 0.05); applyZoom(); };
document.getElementById('zoom-fit-btn').onclick = autoFitZoom;
const zoomSens = 0.001;
viewport.style.overflow = 'auto'; // Re-enable scrollbars so user can pan manually
viewport.style.cursor = 'grab';

// ─── Panning (Space + Drag or Middle Mouse) ───
let isPanning = false, startX, startY, scrollLeft, scrollTop;
const startPan = (e) => {
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
        isPanning = true;
        viewport.style.cursor = 'grabbing';
        startX = e.pageX - viewport.offsetLeft;
        startY = e.pageY - viewport.offsetTop;
        scrollLeft = viewport.scrollLeft;
        scrollTop = viewport.scrollTop;
    }
};
const endPan = () => { isPanning = false; viewport.style.cursor = 'grab'; };
let spaceDown = false;
window.addEventListener('keydown', (e) => { if (e.code === 'Space') spaceDown = true; });
window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });

viewport.addEventListener('mousedown', startPan);
window.addEventListener('mouseup', endPan);
window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    e.preventDefault();
    const x = e.pageX - viewport.offsetLeft;
    const y = e.pageY - viewport.offsetTop;
    const walkX = (x - startX);
    const walkY = (y - startY);
    viewport.scrollLeft = scrollLeft - walkX;
    viewport.scrollTop = scrollTop - walkY;
});

viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = -e.deltaY;
    const factor = Math.pow(1.1, delta / 100); 
    zoomScale = Math.max(0.1, Math.min(3, zoomScale * factor));
    applyZoom();
}, { passive: false });

overlay.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = -e.deltaY;
    const factor = Math.pow(1.1, delta / 100); 
    zoomScale = Math.max(0.1, Math.min(3, zoomScale * factor));
    applyZoom();
}, { passive: false });

// ─── Panel Collapse ───
document.getElementById('collapse-left').onclick = () => document.getElementById('app').classList.toggle('left-collapsed');
document.getElementById('collapse-right').onclick = () => document.getElementById('app').classList.toggle('right-collapsed');

// ─── Render Everything ───
function renderAll() {
    ensureDefaults();
    updateIframeSize();
    renderOverlay();
    renderLeftPanel();
    renderTypoBar();
    if (firstLoad) { firstLoad = false; setTimeout(autoFitZoom, 300); } else { applyZoom(); }
}

function updateIframeSize() {
    const W = D.layout.fullPageWidth || 1123;
    iframe.style.width = W + 'px';
    try {
        const idoc = iframe.contentDocument || iframe.contentWindow?.document;
        const canvas = idoc?.getElementById('resume-canvas');
        if (canvas) { iframe.style.height = Math.max(canvas.scrollHeight || canvas.offsetHeight, 400) + 'px'; }
        else { iframe.style.height = '1587px'; }
    } catch (e) { iframe.style.height = '1587px'; }
}

function ensureDefaults() {
    const ld = {
        colLeftWidth: 255, colMidWidth: 440, sidebarWidth: 315,
        gapLeftMid: 33, gapMidRight: 33, sectionMarginBottom: 25,
        headerMarginBottom: 35, mainAreaPaddingLeft: 45,
        fullPageWidth: 1123, linksPaddingV: 3.5, linksPaddingH: 9,
        jobMarginBottom: 15, gapHeaderTitleLinks: 5,
        gapProfileInfo: 18, gapInfoSkills: 18, sidebarUnitGap: 22,
        headerTitleWidth: 700,
        part1Order: ['profile', 'technical_skills', 'core_skills'],
        part2Order: ['who_i_am', 'jobs'],
        part3Order: ['education', 'strengths', 'weaknesses', 'philosophy', 'seeking']
    };
    if (!D.layout) D.layout = {};
    Object.keys(ld).forEach(k => { if (D.layout[k] === undefined) D.layout[k] = ld[k]; });
    if (!D.spacing) D.spacing = {};
    const sd = { lineHeight: 0.9, letterSpacing: -0.2, baseFs: 11, headerLh: 1.05, headerLs: -2, headerFs: 52, sectionLh: 1.1, sectionLs: -0.5, sectionFs: 18, jobLh: 1.2, jobLs: 0, jobFs: 14 };
    Object.keys(sd).forEach(k => { if (D.spacing[k] === undefined) D.spacing[k] = sd[k]; });

    // Migration: Ensure list sections are arrays
    const listSections = ['experience', 'who_i_am', 'core_skills', 'skills_left', 'skills_right', 'education', 'strengths', 'weaknesses', 'philosophy', 'seeking'];
    listSections.forEach(k => {
        if (D[k] !== undefined && D[k] !== null && !Array.isArray(D[k])) {
            console.log(`Migrating section "${k}" to array`);
            D[k] = [D[k]]; // Wrap legacy single items or strings in an array
        }
    });
}

// ══════════════════════════════════════
// OVERLAY
// ══════════════════════════════════════
function renderOverlay() {
    if (activePage === 'bento') {
        renderBentoOverlay();
        return;
    }

    const L = D.layout;
    const W = L.fullPageWidth || 1123;
    const padL = L.mainAreaPaddingLeft;
    const col1W = L.colLeftWidth;
    const gap1 = L.gapLeftMid;
    const col2W = L.colMidWidth;
    const gap2 = L.gapMidRight;
    const sideW = W - padL - col1W - gap1 - col2W - gap2;
    L.sidebarWidth = Math.max(0, sideW);

    const iH = parseFloat(iframe.style.height) || 1587;
    overlay.style.width = W + 'px';
    overlay.style.height = iH + 'px';

    const contentH = iH - 100;
    const headerH = 100;
    let html = '';
    html += `<div class="ov-zone" data-section="header" style="left:0;top:0;width:${W}px;height:${headerH}px;" title="Header"></div>`;
    html += `<div class="ov-zone" data-section="profile" style="left:${padL}px;top:${headerH}px;width:${col1W}px;height:${contentH}px;" title="Left Column"></div>`;
    html += `<div class="ov-zone" data-section="experience" style="left:${padL + col1W + gap1}px;top:${headerH}px;width:${col2W}px;height:${contentH}px;" title="Middle Column"></div>`;
    html += `<div class="ov-zone" data-section="sidebar_lists" style="left:${padL + col1W + gap1 + col2W + gap2}px;top:${headerH}px;width:${Math.max(0, sideW)}px;height:${contentH}px;" title="Sidebar"></div>`;

    // Gap highlight zones (invisible normally, highlighted on hover)
    html += `<div class="ov-gap" data-gap="gap1" style="left:${padL + col1W}px;top:${headerH}px;width:${gap1}px;height:${contentH}px;" title="Gap 1"></div>`;
    html += `<div class="ov-gap" data-gap="gap2" style="left:${padL + col1W + gap1 + col2W}px;top:${headerH}px;width:${gap2}px;height:${contentH}px;" title="Gap 2"></div>`;
    // Left margin highlight zone
    html += `<div class="ov-gap" data-gap="leftMargin" style="left:0;top:${headerH}px;width:${padL}px;height:${contentH}px;" title="Left Margin"></div>`;
    // Header bottom margin
    html += `<div class="ov-gap" data-gap="headerBottom" style="left:0;top:${headerH - 20}px;width:${W}px;height:${L.headerMarginBottom}px;" title="Header Bottom Margin"></div>`;

    const div1X = padL + col1W;
    const div2X = padL + col1W + gap1 + col2W;
    html += `<div class="ov-divider" data-handle="colLeftWidth" style="left:${div1X - 4}px;" title="Drag to resize Col 1"></div>`;
    html += `<div class="ov-divider" data-handle="colMidWidth" style="left:${div2X - 4}px;" title="Drag to resize Col 2"></div>`;
    html += `<div class="ov-overflow" style="top:${iH}px;"></div>`;

    overlay.innerHTML = html;
    overlay.querySelectorAll('.ov-zone').forEach(el => {
        el.addEventListener('click', (e) => { e.stopPropagation(); selectSection(el.dataset.section); });
    });
    initDividerDrag();
}

function renderBentoOverlay() {
    const W = D.layout?.fullPageWidth || 1123;
    const iH = parseFloat(iframe.style.height) || 900;
    
    overlay.style.width = W + 'px';
    overlay.style.height = iH + 'px';
    
    // For Bento, we'll try to dynamically get the rects from the iframe
    // since the CSS grid is complex to math out here.
    let html = '';
    
    try {
        const idoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (idoc) {
            const cards = [
                { id: 'intro-card', name: 'Intro' },
                { id: 'avatar-card', name: 'Avatar' },
                { id: 'social-card', name: 'Socials', multi: true },
                { id: 'works-card', name: 'Recent Works' },
                { id: 'services-card', name: 'Services' },
                { id: 'tools-card', name: 'Tools' },
                { id: 'collab-card', name: 'Collab' }
            ];
            
            cards.forEach(c => {
                const els = idoc.querySelectorAll('.' + c.id);
                els.forEach(el => {
                    const rect = el.getBoundingClientRect();
                    html += `<div class="ov-zone" data-section="${c.id}" style="left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;" title="${c.name}"></div>`;
                });
            });
        }
    } catch (e) { console.warn('Overlay failed to read iframe:', e); }

    overlay.innerHTML = html;
    overlay.querySelectorAll('.ov-zone').forEach(el => {
        el.addEventListener('click', (e) => { e.stopPropagation(); selectSection(el.dataset.section); });
    });
}

function selectSection(id) {
    selectedSection = id;
    currentSubTab = null;
    overlay.querySelectorAll('.ov-zone').forEach(el => el.classList.remove('selected'));
    overlay.querySelectorAll(`[data-section="${id}"]`).forEach(el => el.classList.add('selected'));
    renderRightPanel(id);
    rightTitle.textContent = id.replace(/_/g, ' ').toUpperCase();
}

// ══════════════════════════════════════
// LEFT PANEL
// ══════════════════════════════════════
function renderLeftPanel() {
    leftPanel.innerHTML = '';
    const leftPanelTitle = document.querySelector('.panel-left .panel-header h2');
    if (leftPanelTitle) leftPanelTitle.textContent = activePage === 'bento' ? 'Bento Config' : 'Layout';
    
    if (activePage === 'bento') {
        renderBentoLeftPanel();
        return;
    }

    const groups = [
        { title: 'Page', stats: [
            { label: 'Page Width', key: 'fullPageWidth', min: 800, max: 2000, zone: 'all' }
        ]},
        { title: 'Columns', stats: [
            { label: 'Col 1 (Left)', key: 'colLeftWidth', min: 50, max: 500, zone: 'profile' },
            { label: 'Gap 1', key: 'gapLeftMid', min: 0, max: 150, zone: 'gap1' },
            { label: 'Col 2 (Mid)', key: 'colMidWidth', min: 100, max: 800, zone: 'experience' },
            { label: 'Gap 2', key: 'gapMidRight', min: 0, max: 150, zone: 'gap2' },
            { label: 'Sidebar', key: 'sidebarWidth', computed: true, zone: 'sidebar_lists' }
        ]},
        { title: 'Header', stats: [
            { label: 'Title Width', key: 'headerTitleWidth', min: 100, max: 1000, zone: 'header', iframeSel: '.main-title' },
            { label: 'Title ↔ Links', key: 'gapHeaderTitleLinks', min: 0, max: 100, zone: 'header', iframeSel: '.contact-card' },
            { label: 'Header Bottom', key: 'headerMarginBottom', min: 0, max: 150, zone: 'headerBottom' }
        ]},
        { title: 'Gaps & Spacing', stats: [
            { label: 'Profile ↔ Info', key: 'gapProfileInfo', min: 0, max: 100, zone: 'profile', iframeSel: '.personal-info' },
            { label: 'Info ↔ Skills', key: 'gapInfoSkills', min: 0, max: 100, zone: 'profile', iframeSel: '#section-technical_skills' },
            { label: 'Section Bottom', key: 'sectionMarginBottom', min: 0, max: 100, zone: 'experience', iframeSel: '.section-title' },
            { label: 'Job Spacing', key: 'jobMarginBottom', min: 0, max: 100, zone: 'experience', iframeSel: '.job:first-of-type' },
            { label: 'Sidebar Unit Gap', key: 'sidebarUnitGap', min: 0, max: 100, zone: 'sidebar_lists', iframeSel: '.sidebar-unit:first-of-type' }
        ]},
        { title: 'Paddings', stats: [
            { label: 'Left Margin', key: 'mainAreaPaddingLeft', min: 0, max: 150, zone: 'leftMargin' },
            { label: 'Links Pad (V)', key: 'linksPaddingV', min: 0, max: 20, step: 0.5, zone: 'header', iframeSel: '.contact-card a' },
            { label: 'Links Pad (H)', key: 'linksPaddingH', min: 0, max: 40, step: 0.5, zone: 'header', iframeSel: '.contact-card a' }
        ]}
    ];

    groups.forEach(g => {
        const group = document.createElement('div');
        group.className = 'control-group';
        group.innerHTML = `<div class="control-group-title">${g.title}</div>`;

        g.stats.forEach(s => {
            const pill = document.createElement('div');
            pill.className = 'stat-pill';
            pill.dataset.key = s.key;

            const val = s.computed
                ? Math.round(D.layout.sidebarWidth || 0)
                : (s.step && s.step < 1 ? parseFloat(D.layout[s.key]).toFixed(1) : Math.round(D.layout[s.key] || 0));

            pill.innerHTML = `
                <span class="stat-label">${s.label}</span>
                <span class="stat-info" title="${TIPS[s.key] || ''}">ⓘ</span>
                <span class="stat-value">${val}<span class="unit">px</span></span>`;

            // Info tooltip on click
            pill.querySelector('.stat-info').onclick = (e) => {
                e.stopPropagation();
                showTooltip(TIPS[s.key] || 'No description available.', e.target);
            };

            // Hover-to-Locate
            pill.onmouseenter = () => highlightZone(s.zone, s.key, s.iframeSel, true);
            pill.onmouseleave = () => highlightZone(s.zone, s.key, s.iframeSel, false);

            // Wheel adjust
            if (!s.computed) {
                pill.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    const step = s.step || 1;
                    const delta = e.deltaY > 0 ? -step : step;
                    D.layout[s.key] = Math.max(s.min, Math.min(s.max, parseFloat(D.layout[s.key]) + delta));
                    renderAll();
                    triggerSave();
                }, { passive: false });
            } else if (s.key === 'sidebarWidth') {
                pill.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    D.layout.colMidWidth = Math.max(100, Math.min(800, D.layout.colMidWidth + (e.deltaY > 0 ? 1 : -1)));
                    renderAll();
                    triggerSave();
                }, { passive: false });
            }
            group.appendChild(pill);
        });
        leftPanel.appendChild(group);
    });
}

function renderBentoLeftPanel() {
    if (!D.layout) D.layout = {};
    const bl = { bentoMaxWidth: 900, bentoGap: 16, bentoCardRadius: 32, spanIntro: 8, spanAvatar: 2, spanWorks: 5, spanServices: 5, spanTools: 4, spanCollab: 6 };
    Object.keys(bl).forEach(k => { if (D.layout[k] === undefined) D.layout[k] = bl[k]; });
    
    if (!D.physics) D.physics = {};
    const bp = { 
        gravity: 1.0, 
        restitution: 0.7, 
        frictionAir: 0.05,
        attractionStrength: 0.0008,
        showIndicator: 1 // 1 for true, 0 for false for easier handling in slider/pill
    };
    Object.keys(bp).forEach(k => { if (D.physics[k] === undefined) D.physics[k] = bp[k]; });

    const groups = [
        { title: 'Grid Span (10 Cols Max)', keyPrefix: 'layout', stats: [
            { label: 'Intro Span', key: 'spanIntro', min: 2, max: 10, step: 1, tip: 'Cols for Intro Card', unit: '' },
            { label: 'Avatar Span', key: 'spanAvatar', min: 2, max: 10, step: 1, tip: 'Cols for Avatar Card', unit: '' },
            { label: 'Works Span', key: 'spanWorks', min: 2, max: 10, step: 1, tip: 'Cols for Works Card', unit: '' },
            { label: 'Services Span', key: 'spanServices', min: 2, max: 10, step: 1, tip: 'Cols for Services Card', unit: '' },
            { label: 'Tools Span', key: 'spanTools', min: 2, max: 10, step: 1, tip: 'Cols for Tools Card', unit: '' },
            { label: 'Collab Span', key: 'spanCollab', min: 2, max: 10, step: 1, tip: 'Cols for Collab Card', unit: '' }
        ]},
        { title: 'Grid Layout', keyPrefix: 'layout', stats: [
            { label: 'Max Width', key: 'bentoMaxWidth', min: 600, max: 1600, step: 10, tip: 'Maximum width of the Bento grid container.' },
            { label: 'Grid Gap', key: 'bentoGap', min: 0, max: 64, step: 1, tip: 'Spacing between cards.' },
            { label: 'Card Radius', key: 'bentoCardRadius', min: 0, max: 64, step: 1, tip: 'Border radius of individual cards.' }
        ]},
        { title: 'Physics Engine', keyPrefix: 'physics', stats: [
            { label: 'Gravity', key: 'gravity', min: 0.1, max: 3.0, step: 0.1, tip: 'Gravity multiplier (how fast things fall).' },
            { label: 'Bounciness', key: 'restitution', min: 0.1, max: 1.2, step: 0.05, tip: 'How bouncy elements are upon collision.' },
            { label: 'Air Friction', key: 'frictionAir', min: 0, max: 0.5, step: 0.01, tip: 'Air resistance (slows down objects over time).' },
            { label: 'Magnetic Power', key: 'attractionStrength', min: 0, max: 0.005, step: 0.0001, tip: 'How strongly the cursor attracts elements.' },
            { label: 'Show Orb', key: 'showIndicator', min: 0, max: 1, step: 1, tip: 'Whether to show the glowing cursor gravity indicator (0=Off, 1=On).', unit: '' }
        ]}
    ];

    groups.forEach(g => {
        const group = document.createElement('div');
        group.className = 'control-group';
        group.innerHTML = `<div class="control-group-title">${g.title}</div>`;

        g.stats.forEach(s => {
            const pill = document.createElement('div');
            pill.className = 'stat-pill';
            
            const obj = D[g.keyPrefix];
            const getVal = (v) => {
                if (s.step < 0.001) return parseFloat(v).toFixed(4);
                if (s.step < 0.1) return parseFloat(v).toFixed(2);
                return Math.round(v);
            };
            const val = getVal(obj[s.key]);
            const unit = s.unit !== undefined ? s.unit : (s.step < 1 ? '' : '<span class="unit">px</span>');
            
            pill.innerHTML = `
                <span class="stat-label">${s.label}</span>
                <span class="stat-info" title="">ⓘ</span>
                <span class="stat-value">${val}${unit}</span>`;

            pill.querySelector('.stat-info').onclick = (e) => {
                e.stopPropagation();
                showTooltip(s.tip, e.target);
            };

            pill.addEventListener('wheel', (e) => {
                e.preventDefault();
                const step = s.step || 1;
                const delta = e.deltaY > 0 ? -step : step;
                obj[s.key] = Math.max(s.min, Math.min(s.max, parseFloat(obj[s.key]) + delta));
                pill.querySelector('.stat-value').innerHTML = getVal(obj[s.key]) + unit;
                
                // Live preview using JS before Save
                if (g.keyPrefix === 'layout') {
                    try {
                        const root = iframe.contentDocument?.documentElement;
                        if (root) {
                            if (s.key === 'bentoMaxWidth') root.style.setProperty('--bento-max-width', obj[s.key] + 'px');
                            if (s.key === 'bentoGap') root.style.setProperty('--bento-gap', obj[s.key] + 'px');
                            if (s.key === 'bentoCardRadius') root.style.setProperty('--card-radius', obj[s.key] + 'px');
                            
                            const spanMap = { spanIntro: '--span-intro', spanAvatar: '--span-avatar', spanWorks: '--span-works', spanServices: '--span-services', spanTools: '--span-tools', spanCollab: '--span-collab' };
                            if (spanMap[s.key]) root.style.setProperty(spanMap[s.key], obj[s.key]);

                            setTimeout(renderOverlay, 100);
                        }
                    } catch(e){}
                } else if (g.keyPrefix === 'physics') {
                    try {
                        const iWin = iframe.contentWindow;
                        if (iWin && iWin.updatePhysicsParams) {
                            iWin.updatePhysicsParams(obj);
                        }
                    } catch(e){}
                }
                
                triggerSave();
            }, { passive: false });
            
            group.appendChild(pill);
        });
        leftPanel.appendChild(group);
    });
}

// ─── Tooltip Popup ───
let tooltipEl = null;
function showTooltip(text, anchor) {
    if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; return; }
    tooltipEl = document.createElement('div');
    tooltipEl.className = 've-tooltip';
    tooltipEl.textContent = text;
    document.body.appendChild(tooltipEl);
    const r = anchor.getBoundingClientRect();
    tooltipEl.style.top = (r.bottom + 6) + 'px';
    tooltipEl.style.left = Math.max(8, r.left - 60) + 'px';
    setTimeout(() => {
        const close = (e) => { if (tooltipEl && !tooltipEl.contains(e.target)) { tooltipEl.remove(); tooltipEl = null; document.removeEventListener('click', close); } };
        document.addEventListener('click', close);
    }, 50);
}

// ─── Hover-to-Locate ───
function highlightZone(zone, key, iframeSel, on) {
    // Overlay divider handles
    const div = overlay.querySelector(`[data-handle="${key}"]`);
    if (div) div.classList.toggle('active', on);

    // Overlay zones
    if (zone === 'all') {
        overlay.querySelectorAll('.ov-zone').forEach(el => el.classList.toggle('highlight', on));
    } else if (zone === 'gap1' || zone === 'gap2' || zone === 'leftMargin' || zone === 'headerBottom') {
        const gap = overlay.querySelector(`[data-gap="${zone}"]`);
        if (gap) gap.classList.toggle('highlight', on);
    } else {
        const el = overlay.querySelector(`[data-section="${zone}"]`);
        if (el) el.classList.toggle('highlight', on);
    }

    // Iframe element highlight (specific CSS element inside the resume)
    if (iframeSel) {
        try {
            const idoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (idoc) {
                idoc.querySelectorAll(iframeSel).forEach(el => {
                    if (on) el.classList.add('ve-hl');
                    else el.classList.remove('ve-hl');
                });
            }
        } catch (e) { /* cross-origin */ }
    }
}

// ══════════════════════════════════════
// DIVIDER DRAG
// ══════════════════════════════════════
function initDividerDrag() {
    let active = null, startX = 0, startVal = 0;
    overlay.querySelectorAll('.ov-divider').forEach(div => {
        div.addEventListener('pointerdown', (e) => {
            e.preventDefault(); e.stopPropagation();
            active = div; startX = e.clientX;
            startVal = D.layout[div.dataset.handle] || 0;
            document.body.style.cursor = 'col-resize';
            div.classList.add('active');
        });
    });
    window.addEventListener('pointermove', (e) => {
        if (!active) return;
        const key = active.dataset.handle;
        let val = startVal + (e.clientX - startX) / zoomScale;
        if (key === 'colLeftWidth') val = Math.max(50, Math.min(500, val));
        if (key === 'colMidWidth') val = Math.max(100, Math.min(800, val));
        D.layout[key] = Math.round(val);
        renderAll(); triggerSave();
    });
    window.addEventListener('pointerup', () => {
        if (active) { active.classList.remove('active'); active = null; document.body.style.cursor = ''; }
    });
}

// ══════════════════════════════════════
// RIGHT PANEL
// ══════════════════════════════════════
function renderRightPanel(sectionId, subTab) {
    rightPanel.innerHTML = '';

    if (activePage === 'bento') {
        renderBentoRightPanel(sectionId, subTab);
        return;
    }

    // ─── HEADER ───
    if (sectionId === 'header') {
        rightPanel.appendChild(veFormGroup('Resume Title', 'text', D.header.title, v => { D.header.title = v; triggerSave(); }));
        const hr = document.createElement('hr'); hr.className = 've-section-divider'; rightPanel.appendChild(hr);
        const h = document.createElement('div'); h.className = 'control-group-title'; h.textContent = 'CONTACT LINKS'; rightPanel.appendChild(h);
        renderReorderableList(rightPanel, D.header.links || [], () => { triggerSave(); renderRightPanel('header'); }, (l, i) => {
            const inpL = document.createElement('input'); inpL.value = l.label; inpL.placeholder = 'Label';
            inpL.oninput = e => { D.header.links[i].label = e.target.value; triggerSave(); };
            const inpU = document.createElement('input'); inpU.value = l.url; inpU.placeholder = 'URL';
            inpU.oninput = e => { D.header.links[i].url = e.target.value; triggerSave(); };
            return [inpL, inpU];
        });
        rightPanel.appendChild(makeAddBtn('Add Link', () => {
            if (!D.header.links) D.header.links = [];
            D.header.links.push({ label: 'New Link', url: 'https://' });
            triggerSave(); renderRightPanel('header');
        }));
    }

    // ─── EXPERIENCE ───
    else if (sectionId === 'experience') {
        const activeTab = subTab || currentSubTab || 'jobs';
        currentSubTab = activeTab;
        rightPanel.appendChild(makeSwitcher([
            { id: 'jobs', label: 'Jobs' }, { id: 'who_i_am', label: 'Bio' }
        ], activeTab, (tabId) => { currentSubTab = tabId; renderRightPanel('experience', tabId); rightTitle.textContent = tabId === 'who_i_am' ? 'BIO' : 'EXPERIENCE'; }));

        if (activeTab === 'jobs') renderJobsAccordion();
        else renderBioSection();
    }

    // ─── PROFILE ───
    else if (sectionId === 'profile') {
        const activeTab = subTab || currentSubTab || 'profile_info';
        currentSubTab = activeTab;
        rightPanel.appendChild(makeSwitcher([
            { id: 'profile_info', label: 'Profile' }, { id: 'technical_skills', label: 'Skills' }, { id: 'core_skills', label: 'Core' }
        ], activeTab, (tabId) => { currentSubTab = tabId; renderRightPanel('profile', tabId); rightTitle.textContent = tabId.replace(/_/g, ' ').toUpperCase(); }));

        if (activeTab === 'profile_info') {
            rightPanel.appendChild(veFormGroup('Name', 'text', D.personal?.name, v => { D.personal.name = v; triggerSave(); }));
            rightPanel.appendChild(veFormGroup('Age', 'text', D.personal?.age, v => { D.personal.age = v; triggerSave(); }));
            rightPanel.appendChild(veFormGroup('Location', 'text', D.personal?.location, v => { D.personal.location = v; triggerSave(); }));
        } else if (activeTab === 'technical_skills') {
            ['skills_left', 'skills_right'].forEach(k => {
                const h = document.createElement('div'); h.className = 'control-group-title'; h.textContent = k.replace('_', ' ').toUpperCase(); rightPanel.appendChild(h);
                renderReorderableList(rightPanel, D[k] || [], () => { triggerSave(); renderRightPanel('profile', 'technical_skills'); }, (s, si) => {
                    const inpL = document.createElement('input'); inpL.value = s.label;
                    inpL.oninput = e => { D[k][si].label = e.target.value; triggerSave(); };
                    const inpP = document.createElement('input'); inpP.value = s.pct; inpP.style.width = '60px';
                    inpP.oninput = e => { D[k][si].pct = e.target.value; triggerSave(); };
                    return [inpL, inpP];
                });
                rightPanel.appendChild(makeAddBtn('Add Skill', () => {
                    if (!D[k]) D[k] = [];
                    D[k].push({ label: 'New Skill', pct: '50%' });
                    triggerSave(); renderRightPanel('profile', 'technical_skills');
                }));
            });
        } else if (activeTab === 'core_skills') {
            renderReorderableList(rightPanel, D.core_skills || [], () => { triggerSave(); renderRightPanel('profile', 'core_skills'); }, (s, si) => {
                const fg = veFormGroup('', 'textarea', s, v => { D.core_skills[si] = v; triggerSave(); });
                fg.style.flex = '1';
                return [fg];
            });
            rightPanel.appendChild(makeAddBtn('Add Core Skill', () => {
                if (!D.core_skills) D.core_skills = [];
                D.core_skills.push('New core skill');
                triggerSave(); renderRightPanel('profile', 'core_skills');
            }));
        }
    }

    // ─── SIDEBAR ───
    else if (sectionId === 'sidebar_lists') {
        const sidebarSections = D.layout.part3Order || ['education', 'strengths', 'weaknesses', 'philosophy', 'seeking'];
        const activeTab = subTab || currentSubTab || sidebarSections[0];
        currentSubTab = activeTab;
        rightPanel.appendChild(makeSwitcher(
            sidebarSections.map(sid => ({ id: sid, label: sid.charAt(0).toUpperCase() + sid.slice(1) })),
            activeTab, (tabId) => { currentSubTab = tabId; renderRightPanel('sidebar_lists', tabId); rightTitle.textContent = tabId.toUpperCase(); }
        ));

        renderReorderableList(rightPanel, D[activeTab] || [], () => { triggerSave(); renderRightPanel('sidebar_lists', activeTab); }, (item, ii) => {
            const fg = veFormGroup(`Item ${ii + 1}`, 'textarea', item, v => { D[activeTab][ii] = v; triggerSave(); });
            fg.style.flex = '1';
            return [fg];
        });
        rightPanel.appendChild(makeAddBtn(`Add ${activeTab}`, () => {
            if (!D[activeTab]) D[activeTab] = [];
            D[activeTab].push('New item');
            triggerSave(); renderRightPanel('sidebar_lists', activeTab);
        }));
    }

    else {
        rightPanel.innerHTML = `<div class="empty-state"><div class="empty-icon">✦</div><p>Click any section in the preview to edit its content here.</p></div>`;
    }
}

function renderBentoRightPanel(sectionId, subTab) {
    if (sectionId === 'intro-card') {
        if (!D.intro) D.intro = { title: "Hey, I'm Varnika", subtitle: "Product Designer @VVStudios", about_title: "About Me", bio: "I'm a Product Designer based in San Francisco...", status: "Available for work" };
        rightPanel.appendChild(veFormGroup('Title', 'text', D.intro.title, v => { D.intro.title = v; triggerSave(); }));
        rightPanel.appendChild(veFormGroup('Subtitle', 'text', D.intro.subtitle, v => { D.intro.subtitle = v; triggerSave(); }));
        rightPanel.appendChild(veFormGroup('Back Title', 'text', D.intro.about_title || 'About Me', v => { D.intro.about_title = v; triggerSave(); }));
        rightPanel.appendChild(veFormGroup('About Me (Back Face Content)', 'textarea', D.intro.bio, v => { D.intro.bio = v; triggerSave(); }));
        rightPanel.appendChild(veFormGroup('Status Button Text', 'text', D.intro.status || 'Available for work', v => { D.intro.status = v; triggerSave(); }));
        
        if (!D.collab) D.collab = { copy_text: "hello@example.com" };
        rightPanel.appendChild(veFormGroup('Text to Copy (Supports Multiple Lines)', 'text-multiline', D.collab.copy_text || '', v => { D.collab.copy_text = v; triggerSave(); }));
    }
    else if (sectionId === 'avatar-card') {
        if (!D.avatar) D.avatar = { image_url: "https://pub-ad0cab8325564e91b51bba350c9b9425.r2.dev/resume/images/avatar.png", title: "View Bio", subtitle: "Click to see my journey", bio: "" };
        rightPanel.appendChild(veFormGroup('Avatar Image URL', 'plain', D.avatar.image_url, v => { D.avatar.image_url = v; triggerSave(); }));
        rightPanel.appendChild(veFormGroup('Back Title', 'text', D.avatar.title || 'View Bio', v => { D.avatar.title = v; triggerSave(); }));
        rightPanel.appendChild(veFormGroup('Back Subtitle', 'text', D.avatar.subtitle || 'Click to see my journey', v => { D.avatar.subtitle = v; triggerSave(); }));
        const bioHtml = typeof D.avatar.bio === "string" ? D.avatar.bio : "";
        rightPanel.appendChild(veFormGroup('Extended Bio Popup (HTML)', 'textarea', bioHtml, v => { D.avatar.bio = v; triggerSave(); }));
    }
    else if (sectionId === 'social-card') {
        const REQUESTED_SOCIALS = [
            { name: 'LinkedIn', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3V10h3v9zm-1.5-10.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 10.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3V10h3v1.765c1.396-2.586 7-2.777 7 2.476v4.759z"/></svg>', url: 'https://www.linkedin.com/in/amine-elmoufid/' },
            { name: 'Instagram', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.17.054 1.805.249 2.227.412.56.216.96.474 1.38.894.42.42.678.82.894 1.38.163.422.358 1.057.412 2.227.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.054 1.17-.249 1.805-.412 2.227-.216.56-.474.96-.894 1.38-.42.42-.82.678-1.38.894-.422.163-1.057.358-2.227.412-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.17-.054-1.805-.249-2.227-.412-.56-.216-.96-.474-1.38-.894-.42-.42-.678-.82-.894-1.38-.163-.422-.358-1.057-.412-2.227-.058-1.266-.07-1.646-.07-4.85s.012-3.584.07-4.85c.054-1.17.249-1.805.412-2.227.216-.56.474-.96.894-1.38.42-.42.82-.678 1.38-.894.422-.163 1.057-.358 2.227-.412 1.266-.058 1.646-.07 4.85-.07m0-2.163c-3.259 0-3.667.014-4.947.072-1.277.058-2.148.261-2.911.558a5.811 5.811 0 00-2.103 1.371A5.82 5.82 0 00.741 4.102c-.297.763-.5 1.634-.558 2.911-.058 1.28-.072 1.688-.072 4.947s.014 3.667.072 4.947c.058 1.277.261 2.148.558 2.911a5.82 5.82 0 001.371 2.103 5.823 5.823 0 002.103 1.371c.763.297 1.634.5 2.911.558 1.28.058 1.688.072 4.947.072s3.667-.014 4.947-.072c1.277-.058 2.148-.261 2.911-.558a5.82 5.82 0 002.103-1.371 5.823 5.823 0 001.371-2.103c.297-.763.5-1.634.558-2.911.058-1.28.072-1.688.072-4.947s-.014-3.667-.072-4.947c-.058-1.277-.261-2.148-.558-2.911a5.823 5.823 0 00-1.371-2.103 5.823 5.823 0 00-2.103-1.371c-.763-.297-1.634-.5-2.911-.558-1.28-.058-1.688-.072-4.947-.072z"/></svg>', url: 'https://www.instagram.com/amine_elmoufid/' },
            { name: 'Portfolio', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>', url: 'feed.html' },
            { name: 'Folders', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>', url: 'amine.ink/' },
            { name: 'Resume', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>', url: 'index.html' }
        ];

        if (!D.socials) D.socials = JSON.parse(JSON.stringify(REQUESTED_SOCIALS));

        const syncBtn = document.createElement('button');
        syncBtn.className = 've-add-btn';
        syncBtn.style.background = '#4facfe';
        syncBtn.style.color = 'white';
        syncBtn.style.marginBottom = '20px';
        syncBtn.textContent = '✦ Sync to Requested Links';
        syncBtn.onclick = () => {
            if (confirm('This will overwrite your currents social links with the requested ones (LinkedIn, Instagram, Portfolio, Folders, Resume). Proceed?')) {
                D.socials = JSON.parse(JSON.stringify(REQUESTED_SOCIALS));
                triggerSave();
                renderRightPanel('social-card');
            }
        };
        rightPanel.appendChild(syncBtn);
        
        // Migration for old strings array to objects array
        if (D.socials.length > 0 && typeof D.socials[0] === 'string') {
            D.socials = D.socials.map(s => ({ svg: s, url: '#' }));
        }
        renderReorderableList(rightPanel, D.socials, () => { triggerSave(); renderRightPanel('social-card') }, (item, i) => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'flex:1; display:flex; flex-direction:column; gap:8px;';
            wrap.appendChild(veFormGroup(`Link Title (Back Face) ${i + 1}`, 'text', item.name || '', v => { D.socials[i].name = v; triggerSave(); }));
            wrap.appendChild(veFormGroup(`Link URL ${i + 1}`, 'plain', item.url, v => { D.socials[i].url = v; triggerSave(); }));
            wrap.appendChild(veFormGroup(`Icon SVG ${i + 1}`, 'plain', item.svg, v => { D.socials[i].svg = v; triggerSave(); }));
            return [wrap];
        });
        rightPanel.appendChild(makeAddBtn('Add Social Icon', () => {
            if(D.socials.length < 5) {
                D.socials.push({ svg: '<svg viewBox="0 0 24 24" fill="currentColor" class="social-icon"><circle cx="12" cy="12" r="10"/></svg>', url: '#' });
                triggerSave(); renderRightPanel('social-card');
            } else {
                alert('Maximum 5 social icons allowed in this layout.');
            }
        }));
    }
    else if (sectionId === 'works-card') {
        if (!D.works) D.works = { title: "Recent Works", subtitle: "Bright modern web blocks fitting all family updates!", items: [] };
        if (!D.works.items) D.works.items = [
            { url: "#", image_url: "", popup_content: "" },
            { url: "#", image_url: "", popup_content: "" },
            { url: "#", image_url: "", popup_content: "" }
        ];
        rightPanel.appendChild(veFormGroup('Card Title', 'text', D.works.title, v => { D.works.title = v; triggerSave(); }));
        rightPanel.appendChild(veFormGroup('Subtitle', 'text', D.works.subtitle, v => { D.works.subtitle = v; triggerSave(); }));
        
        const hr = document.createElement('hr'); hr.className = 've-section-divider'; rightPanel.appendChild(hr);
        const h = document.createElement('div'); h.className = 'control-group-title'; h.textContent = 'INDIVIDUAL WORKS'; rightPanel.appendChild(h);
        
        D.works.items.forEach((item, i) => {
            const card = document.createElement('div');
            card.className = 've-item-card';
            card.innerHTML = `<h4>Work Item ${i + 1}</h4>`;
            card.appendChild(veFormGroup('Preview Image URL', 'plain', item.image_url, v => { D.works.items[i].image_url = v; triggerSave(); }));
            card.appendChild(veFormGroup('Popup Content (HTML)', 'textarea', item.popup_content || '', v => { D.works.items[i].popup_content = v; triggerSave(); }));
            rightPanel.appendChild(card);
        });
    }
    else if (sectionId === 'services-card') {
        if (!D.services_config) D.services_config = { title: "Services" };
        rightPanel.appendChild(veFormGroup('Section Title', 'text', D.services_config.title, v => { D.services_config.title = v; triggerSave(); }));
        const shr = document.createElement('hr'); shr.className = 've-section-divider'; rightPanel.appendChild(shr);
        
        if (!D.services) D.services = [
            { name: 'Webflow', popup_content: '' },
            { name: 'SEO', popup_content: '' },
            { name: 'Framer', popup_content: '' },
            { name: 'UX/UI Design', popup_content: '' },
            { name: 'Branding', popup_content: '' },
            { name: '3D Design', popup_content: '' },
            { name: 'Social Media', popup_content: '' }
        ];
        renderReorderableList(rightPanel, D.services, () => { triggerSave(); renderRightPanel('services-card') }, (srv, i) => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'flex:1; display:flex; flex-direction:column; gap:8px;';
            wrap.appendChild(veFormGroup(`Service Name ${i + 1}`, 'text', srv.name || srv, v => { 
                if (typeof D.services[i] === 'string') D.services[i] = { name: v, popup_content: '' };
                else D.services[i].name = v; 
                triggerSave(); 
            }));
            wrap.appendChild(veFormGroup(`Popup Content (HTML)`, 'textarea', srv.popup_content || '', v => { 
                if (typeof D.services[i] === 'string') D.services[i] = { name: D.services[i], popup_content: v };
                else D.services[i].popup_content = v; 
                triggerSave(); 
            }));
            return [wrap];
        });
        rightPanel.appendChild(makeAddBtn('Add Service Pill', () => {
            D.services.push('New Service');
            triggerSave(); renderRightPanel('services-card');
        }));
    }
    else if (sectionId === 'tools-card') {
        if (!D.tools_config) D.tools_config = { title: "Tools I use" };
        rightPanel.appendChild(veFormGroup('Section Title', 'text', D.tools_config.title, v => { D.tools_config.title = v; triggerSave(); }));
        const thr = document.createElement('hr'); thr.className = 've-section-divider'; rightPanel.appendChild(thr);

        if (!D.tools) D.tools = [
            { url: "https://upload.wikimedia.org/wikipedia/commons/4/45/Notion_app_logo.png", popup_content: "" },
            { url: "https://upload.wikimedia.org/wikipedia/commons/3/33/Framer_logo.svg", popup_content: "" },
            { url: "https://upload.wikimedia.org/wikipedia/commons/c/cb/Adobe_Illustrator_Icon_2020.svg", popup_content: "" },
            { url: "https://upload.wikimedia.org/wikipedia/commons/3/33/Figma-logo.svg", popup_content: "" },
            { url: "https://cdn.worldvectorlogo.com/logos/webflow-custom-icon.svg", popup_content: "" }
        ];
        renderReorderableList(rightPanel, D.tools, () => { triggerSave(); renderRightPanel('tools-card') }, (tool, i) => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'flex:1; display:flex; flex-direction:column; gap:8px;';
            wrap.appendChild(veFormGroup(`Icon URL ${i + 1}`, 'plain', tool.url || tool, v => { 
                if (typeof D.tools[i] === 'string') D.tools[i] = { url: v, name: '', desc: '', popup_content: '' };
                else D.tools[i].url = v;
                triggerSave(); 
            }));
            wrap.appendChild(veFormGroup(`Tool Name ${i + 1}`, 'text', tool.name || '', v => { 
                if (typeof D.tools[i] === 'string') D.tools[i] = { url: D.tools[i], name: v, desc: '', popup_content: '' };
                else D.tools[i].name = v;
                triggerSave(); 
            }));
            wrap.appendChild(veFormGroup(`Short Description ${i + 1}`, 'text', tool.desc || '', v => { 
                if (typeof D.tools[i] === 'string') D.tools[i] = { url: D.tools[i], name: D.tools[i].name || '', desc: v, popup_content: '' };
                else D.tools[i].desc = v;
                triggerSave(); 
            }));
            wrap.appendChild(veFormGroup(`Popup Content (HTML)`, 'textarea', tool.popup_content || '', v => { 
                if (typeof D.tools[i] === 'string') D.tools[i] = { url: D.tools[i], name: '', desc: '', popup_content: v };
                else D.tools[i].popup_content = v;
                triggerSave(); 
            }));
            return [wrap];
        });
        rightPanel.appendChild(makeAddBtn('Add Tool Icon', () => {
            D.tools.push({ url: 'https://example.com/icon.svg', popup_content: '' });
            triggerSave(); renderRightPanel('tools-card');
        }));
    }
    else if (sectionId === 'collab-card') {
        if (!D.collab) D.collab = { 
            title: "Let's collab!", 
            text: "Let's turn your idea into reality with my design experience!", 
            btn_text: "Send a message now!", 
            url: "mailto:hello@example.com", 
            copy_text: "hello@example.com",
            ig_url: "",
            li_url: "",
            wa_num: "",
            ph_num: ""
        };
        rightPanel.appendChild(veFormGroup('Title', 'text', D.collab.title, v => { D.collab.title = v; triggerSave(); }));
        rightPanel.appendChild(veFormGroup('Text', 'textarea', D.collab.text, v => { D.collab.text = v; triggerSave(); }));
        rightPanel.appendChild(veFormGroup('Button Text', 'plain', D.collab.btn_text, v => { D.collab.btn_text = v; triggerSave(); }));
        rightPanel.appendChild(veFormGroup('Default Email URL', 'plain', D.collab.url || '', v => { D.collab.url = v; triggerSave(); }));
        rightPanel.appendChild(veFormGroup('Instagram DM URL', 'plain', D.collab.ig_url || '', v => { D.collab.ig_url = v; triggerSave(); }));
        rightPanel.appendChild(veFormGroup('LinkedIn Profile URL', 'plain', D.collab.li_url || '', v => { D.collab.li_url = v; triggerSave(); }));
        rightPanel.appendChild(veFormGroup('WhatsApp Number/Link', 'plain', D.collab.wa_num || '', v => { D.collab.wa_num = v; triggerSave(); }));
        rightPanel.appendChild(veFormGroup('Phone Number', 'plain', D.collab.ph_num || '', v => { D.collab.ph_num = v; triggerSave(); }));
        rightPanel.appendChild(veFormGroup('Text to Copy (for Status Btn)', 'plain', D.collab.copy_text || '', v => { D.collab.copy_text = v; triggerSave(); }));
    }
    else {
        rightPanel.innerHTML = `<div class="empty-state"><div class="empty-icon">✦</div><p>Click any section in the preview to edit its content here.</p></div>`;
    }
}

// ─── Jobs Accordion (with reorder) ───
function renderJobsAccordion() {
    const container = document.createElement('div');
    container.className = 've-accordion';

    (D.experience || []).forEach((job, idx) => {
        const card = document.createElement('div');
        card.className = 've-accordion-item';

        const header = document.createElement('div');
        header.className = 've-accordion-header';

        // Reorder arrows
        const arrows = makeReorderBtns(idx, D.experience, () => { triggerSave(); renderRightPanel('experience', 'jobs'); });
        const title = document.createElement('span');
        title.className = 've-accordion-title';
        title.textContent = job.title || 'Untitled Job';
        const toggle = document.createElement('span');
        toggle.className = 've-acc-toggle';
        toggle.textContent = '▼';

        header.appendChild(arrows);
        header.appendChild(title);
        header.appendChild(toggle);

        const body = document.createElement('div');
        body.className = 've-accordion-body';
        body.style.display = 'none';

        body.appendChild(veFormGroup('Title', 'text', job.title, v => {
            D.experience[idx].title = v; title.textContent = v || 'Untitled Job'; triggerSave();
        }));
        body.appendChild(veFormGroup('Meta', 'text', job.meta, v => { D.experience[idx].meta = v; triggerSave(); }));
        body.appendChild(veFormGroup('Explanation', 'textarea', job.explanation || '', v => { D.experience[idx].explanation = v; triggerSave(); }));

        const bh = document.createElement('div'); bh.className = 'control-group-title'; bh.textContent = 'BULLETS'; bh.style.marginTop = '8px'; body.appendChild(bh);

        renderReorderableList(body, job.bullets || [], () => { triggerSave(); renderRightPanel('experience', 'jobs'); }, (b, bi) => {
            const fg = veFormGroup('', 'textarea', b, v => { D.experience[idx].bullets[bi] = v; triggerSave(); });
            fg.style.flex = '1';
            return [fg];
        });
        body.appendChild(makeAddBtn('Add Bullet', () => {
            if (!D.experience[idx].bullets) D.experience[idx].bullets = [];
            D.experience[idx].bullets.push('New bullet point');
            triggerSave(); renderRightPanel('experience', 'jobs');
        }));

        const delJobBtn = document.createElement('button');
        delJobBtn.className = 've-delete-item';
        delJobBtn.textContent = '🗑 Remove Job';
        delJobBtn.onclick = () => { D.experience.splice(idx, 1); triggerSave(); renderRightPanel('experience', 'jobs'); };
        body.appendChild(delJobBtn);

        header.onclick = (e) => {
            if (e.target.closest('.ve-reorder-btn')) return; // don't toggle if clicking arrows
            const isOpen = body.style.display !== 'none';
            body.style.display = isOpen ? 'none' : 'block';
            toggle.textContent = isOpen ? '▼' : '▲';
            card.classList.toggle('open', !isOpen);
        };

        card.appendChild(header);
        card.appendChild(body);
        container.appendChild(card);
    });

    rightPanel.appendChild(container);
    rightPanel.appendChild(makeAddBtn('Add Job', () => {
        if (!D.experience) D.experience = [];
        D.experience.push({ title: 'New Job', meta: 'Location | Date', bullets: ['First bullet'], explanation: '' });
        triggerSave(); renderRightPanel('experience', 'jobs');
    }));
}

// ─── Bio Section (with reorder) ───
function renderBioSection() {
    renderReorderableList(rightPanel, D.who_i_am || [], () => { triggerSave(); renderRightPanel('experience', 'who_i_am'); }, (p, idx) => {
        const card = document.createElement('div'); card.className = 've-item-card';
        card.innerHTML = `<h4>Paragraph ${idx + 1}</h4>`;
        const textVal = typeof p === 'string' ? p : (p.text || '');
        const expVal = typeof p === 'string' ? '' : (p.explanation || '');
        card.appendChild(veFormGroup('Text', 'textarea', textVal, v => {
            if (typeof D.who_i_am[idx] === 'string') D.who_i_am[idx] = { text: v, explanation: '' };
            else D.who_i_am[idx].text = v;
            triggerSave();
        }));
        card.appendChild(veFormGroup('Explanation', 'textarea', expVal, v => {
            if (typeof D.who_i_am[idx] === 'string') D.who_i_am[idx] = { text: D.who_i_am[idx], explanation: v };
            else D.who_i_am[idx].explanation = v;
            triggerSave();
        }));
        return [card];
    }, true); // fullWidth = true (no inline row)
    rightPanel.appendChild(makeAddBtn('Add Paragraph', () => {
        if (!D.who_i_am) D.who_i_am = [];
        D.who_i_am.push({ text: 'New paragraph', explanation: '' });
        triggerSave(); renderRightPanel('experience', 'who_i_am');
    }));
}

// ══════════════════════════════════════
// UI HELPERS
// ══════════════════════════════════════
function makeSwitcher(tabs, activeId, onChange) {
    const sw = document.createElement('div');
    sw.className = 'section-switcher';
    tabs.forEach(t => {
        const btn = document.createElement('button');
        btn.className = 'sw-btn' + (t.id === activeId ? ' active' : '');
        btn.textContent = t.label;
        btn.onclick = () => onChange(t.id);
        sw.appendChild(btn);
    });
    return sw;
}

function makeAddBtn(label, onClick) {
    const btn = document.createElement('button');
    btn.className = 've-add-btn';
    btn.textContent = '+ ' + label;
    btn.onclick = onClick;
    return btn;
}

function makeDeleteBtn(onClick) {
    const btn = document.createElement('button');
    btn.className = 've-del-btn';
    btn.textContent = '✕';
    btn.title = 'Remove';
    btn.onclick = (e) => { e.stopPropagation(); onClick(); };
    return btn;
}

// ─── Reorder Buttons ───
function makeReorderBtns(idx, arr, onReorder) {
    const wrap = document.createElement('span');
    wrap.className = 've-reorder-btns';
    const up = document.createElement('button');
    up.className = 've-reorder-btn';
    up.textContent = '▲';
    up.title = 'Move up';
    up.disabled = idx === 0;
    up.onclick = (e) => { e.stopPropagation(); if (idx > 0) { [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]; onReorder(arr); } };
    const down = document.createElement('button');
    down.className = 've-reorder-btn';
    down.textContent = '▼';
    down.title = 'Move down';
    down.disabled = idx === arr.length - 1;
    down.onclick = (e) => { e.stopPropagation(); if (idx < arr.length - 1) { [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]; onReorder(arr); } };
    wrap.appendChild(up);
    wrap.appendChild(down);
    return wrap;
}

// ─── Reorderable List ───
// renderFn(item, index) should return array of DOM elements to put in the row
function renderReorderableList(container, arr, onMutate, renderFn, fullWidth = false) {
    arr.forEach((item, i) => {
        const row = document.createElement('div');
        row.className = fullWidth ? 've-reorder-row-full' : 've-dynamic-row';
        const arrows = makeReorderBtns(i, arr, onMutate);
        const elements = renderFn(item, i);
        row.appendChild(arrows);
        elements.forEach(el => row.appendChild(el));
        const delBtn = makeDeleteBtn(() => { arr.splice(i, 1); onMutate(arr); });
        row.appendChild(delBtn);
        container.appendChild(row);
    });
}

// ─── Form Components ───
function veFormGroup(label, type, value, oninput) {
    const group = document.createElement('div');
    group.className = 've-form-group';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

    if (label) {
        const lbl = document.createElement('label');
        lbl.textContent = label;
        header.appendChild(lbl);
    }

    if (type !== 'plain') {
        const toolbar = document.createElement('div');
        toolbar.className = 've-toolbar';
        [{ l: 'B', c: 'bold' }, { l: 'I', c: 'italic' }, { l: 'U', c: 'underline' }].forEach(t => {
            const btn = document.createElement('button');
            btn.textContent = t.l;
            btn.onmousedown = (e) => { e.preventDefault(); };
            btn.onclick = () => { document.execCommand(t.c, false, null); if(input.contentEditable) oninput(input.innerHTML); };
            toolbar.appendChild(btn);
        });
        header.appendChild(toolbar);
    }
    group.appendChild(header);

    let input;
    if (type === 'plain') {
        input = document.createElement('input');
        input.type = 'text';
        input.className = 've-input-plain';
        input.value = value || '';
        input.oninput = () => oninput(input.value);
    } else if (type === 'text-multiline') {
        input = document.createElement('textarea');
        input.className = 've-input-textarea';
        input.style.minHeight = '100px';
        input.value = (value || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/div><div>/gi, '\n').replace(/<(?:.|\n)*?>/gm, '');
        input.oninput = () => oninput(input.value);
    } else {
        input = document.createElement('div');
        input.className = 've-input';
        input.contentEditable = true;
        input.innerHTML = value || '';
        if (type === 'textarea') input.dataset.type = 'textarea';
        input.oninput = () => oninput(input.innerHTML);
        input.onpaste = (e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); };
        if (type !== 'textarea') { input.onkeydown = (e) => { if (e.key === 'Enter') e.preventDefault(); }; }
    }

    group.appendChild(input);
    return group;
}

// ══════════════════════════════════════
// BOTTOM BAR — Typography
// ══════════════════════════════════════
function renderTypoBar() {
    typoBar.innerHTML = '';
    
    if (activePage === 'bento') {
        typoBar.innerHTML = '<div style="padding: 10px; color: var(--text-muted); font-size: 13px;">✦ Bento Box typography sizes automatically responsively via CSS variables.</div>';
        return;
    }

    const controls = [
        { label: 'Body LH', key: 'lineHeight', min: 0.5, max: 2.5, step: 0.05, tip: TIPS.lineHeight },
        { label: 'Body LS', key: 'letterSpacing', min: -2, max: 5, step: 0.1, tip: TIPS.letterSpacing },
        { label: 'Body FS', key: 'baseFs', min: 8, max: 24, step: 1, tip: TIPS.baseFs },
        { label: 'H1 FS', key: 'headerFs', min: 20, max: 100, step: 1, tip: TIPS.headerFs },
        { label: 'Sec FS', key: 'sectionFs', min: 10, max: 40, step: 1, tip: TIPS.sectionFs },
        { label: 'Job FS', key: 'jobFs', min: 8, max: 30, step: 1, tip: TIPS.jobFs }
    ];

    controls.forEach(c => {
        const wrap = document.createElement('div');
        wrap.className = 'typo-control';
        wrap.title = c.tip || '';

        const lbl = document.createElement('span');
        lbl.className = 'typo-label';
        lbl.textContent = c.label;

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'typo-slider';
        slider.min = c.min; slider.max = c.max; slider.step = c.step;
        slider.value = D.spacing[c.key];

        const valSpan = document.createElement('span');
        valSpan.className = 'typo-value';
        valSpan.textContent = c.step < 1 ? parseFloat(D.spacing[c.key]).toFixed(1) : D.spacing[c.key];

        slider.oninput = () => {
            D.spacing[c.key] = parseFloat(slider.value);
            valSpan.textContent = c.step < 1 ? parseFloat(slider.value).toFixed(1) : slider.value;
            triggerSave();
        };
        slider.onwheel = (e) => {
            e.preventDefault();
            let val = Math.max(c.min, Math.min(c.max, parseFloat(slider.value) + (e.deltaY > 0 ? -c.step : c.step)));
            slider.value = val;
            D.spacing[c.key] = val;
            valSpan.textContent = c.step < 1 ? val.toFixed(1) : Math.round(val);
            triggerSave();
        };

        wrap.appendChild(lbl);
        wrap.appendChild(slider);
        wrap.appendChild(valSpan);
        typoBar.appendChild(wrap);
    });
}

// ══════════════════════════════════════
// FIREBASE LISTENER
// ══════════════════════════════════════
function setupListener() {
    unsubscribe = onValue(currentRef, (snapshot) => {
        let data = snapshot.val();
        dataLoaded = true;
        if (data && typeof data === 'object') {
            D = data;
            syncDot.className = 'dot green';
            syncLabel.textContent = 'Connected';
        } else {
            D = {}; 
            syncDot.className = 'dot red';
            syncLabel.textContent = data === null ? 'No data' : 'Data mismatch';
        }
        renderAll(); 
    }, (error) => {
        syncDot.className = 'dot red';
        syncLabel.textContent = 'Offline';
    });
}

// Finalize
setupListener();

// Send mouse position to iframe for bento attraction
window.addEventListener('mousemove', (e) => {
    if (!iframe || !iframe.contentWindow) return;
    
    const rect = iframe.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoomScale;
    const y = (e.clientY - rect.top) / zoomScale;
    
    iframe.contentWindow.postMessage({
        type: 'HEARTBEAT_MOUSE',
        x: x,
        y: y
    }, '*');
});
