import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, get } from "firebase/database";
import { firebaseConfig } from "../data/firebase-config.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const resumeRef = ref(db, 'resume');

let currentData = {};
let currentSection = 'header';

// DOM Elements
const formContainer = document.getElementById('editor-form');
const sectionTitleEl = document.getElementById('current-section-title');
const statusEl = document.getElementById('status-message');

let saveTimeout;
let isLocalUpdate = false; // Flag to prevent UI resets during local typing

// Dynamic Auto-Save with Debounce
function triggerAutoSave() {
    if (!statusEl) return;
    clearTimeout(saveTimeout);
    statusEl.textContent = 'Changes detected...';
    statusEl.className = 'status-message saving';
    
    saveTimeout = setTimeout(async () => {
        statusEl.textContent = 'Syncing...';
        try {
            await set(resumeRef, currentData);
            statusEl.textContent = 'Saved to cloud';
            statusEl.className = 'status-message success';
            setTimeout(() => {
                if (statusEl.textContent === 'Saved to cloud') {
                    statusEl.textContent = 'All systems go.';
                    statusEl.className = 'status-message';
                }
            }, 2000);
        } catch (e) {
            statusEl.textContent = 'Sync failed: ' + e.message;
            statusEl.className = 'status-message error';
        }
    }, 1000); // 1s debounce
}

// Show status (Repurposed for auto-save notifications)
function showStatus(text, type = '') {
    statusEl.textContent = text;
    statusEl.className = 'status-message ' + type;
    setTimeout(() => {
        statusEl.textContent = 'All systems go.';
        statusEl.className = 'status-message';
    }, 3000);
}

// Global exposure for nav buttons
window.showSection = (section) => {
    currentSection = section;
    
    // Update nav active state (Search for buttons with text content or specific attributes)
    document.querySelectorAll('.nav-dock button').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick').includes(`'${section}'`));
    });
    
    // Update title
    const titles = {
        header: 'Header Data',
        personal: 'Identity Profile',
        skills: 'Skill Matrices',
        core_skills: 'Core Capabilities',
        who_i_am: 'Strategic Bio',
        experience: 'Field Experience',
        education: 'Academic History',
        sidebar_lists: 'Sidebar Units',
        spacing: 'Typography & Spacing',
        layout: 'Grid Ratios & Layout'
    };
    sectionTitleEl.textContent = titles[section] || section;
    
    renderForm();
};

// Dynamic List Helpers
function addItem(array, template = "") {
    array.push(template);
    renderForm();
    triggerAutoSave();
}

function removeItem(array, index) {
    if (array.length <= 1 && currentSection !== 'experience') return; // Keep at least one for some sections
    array.splice(index, 1);
    renderForm();
    triggerAutoSave();
}

// Render form based on current section
function renderForm() {
    formContainer.innerHTML = '';
    const data = currentData[currentSection];

    // Bypass data check for virtual sections that aggregate multiple root keys
    const isVirtualSection = ['skills', 'sidebar_lists', 'spacing', 'layout'].includes(currentSection);

    if (!data && !isVirtualSection) {
        formContainer.innerHTML = '<p>Loading or no data available for this section.</p>';
        return;
    }

    if (currentSection === 'header') {
        const titleGroup = createFormGroup('Resume Title', 'text', data.title, (val) => {
            currentData.header.title = val;
            triggerAutoSave();
        });
        formContainer.appendChild(titleGroup);

        const linksHeader = document.createElement('label');
        linksHeader.textContent = 'Contact Links';
        formContainer.appendChild(linksHeader);

        data.links.forEach((link, idx) => {
            const row = document.createElement('div');
            row.className = 'dynamic-list-item';
            row.style.alignItems = 'center';
            row.style.marginBottom = '10px';
            
            const labelInput = document.createElement('input');
            labelInput.placeholder = 'Label';
            labelInput.value = link.label;
            labelInput.oninput = (e) => currentData.header.links[idx].label = e.target.value;

            const urlInput = document.createElement('input');
            urlInput.placeholder = 'URL';
            urlInput.value = link.url;
            urlInput.oninput = (e) => {
                currentData.header.links[idx].url = e.target.value;
                triggerAutoSave();
            };

            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn-sm';
            delBtn.textContent = 'X';
            delBtn.onclick = () => removeItem(currentData.header.links, idx);

            row.appendChild(labelInput);
            row.appendChild(urlInput);
            row.appendChild(delBtn);
            formContainer.appendChild(row);
        });

        const addBtn = document.createElement('button');
        addBtn.className = 'add-btn';
        addBtn.textContent = '+ Add Link';
        addBtn.onclick = () => addItem(currentData.header.links, { label: "", url: "" });
        formContainer.appendChild(addBtn);
    }

    if (currentSection === 'personal') {
        formContainer.appendChild(createFormGroup('Name', 'text', data.name, (val) => { currentData.personal.name = val; triggerAutoSave(); }));
        formContainer.appendChild(createFormGroup('Age', 'text', data.age, (val) => { currentData.personal.age = val; triggerAutoSave(); }));
        formContainer.appendChild(createFormGroup('Location', 'text', data.location, (val) => { currentData.personal.location = val; triggerAutoSave(); }));
    }

    if (currentSection === 'who_i_am') {
        data.forEach((p, idx) => {
            const row = document.createElement('div');
            row.className = 'item-card'; // Consistent with Experience
            row.style.position = 'relative';
            row.style.marginBottom = '20px';

            const area = createFormGroup(`Paragraph ${idx+1}`, 'textarea', p.text || p, (val) => {
                if (typeof currentData.who_i_am[idx] === 'string') {
                    currentData.who_i_am[idx] = { text: val, explanation: "" };
                } else {
                    currentData.who_i_am[idx].text = val;
                }
                triggerAutoSave();
            });
            row.appendChild(area);

            const expArea = createFormGroup(`Popup Explanation`, 'textarea', p.explanation || "", (val) => {
                if (typeof currentData.who_i_am[idx] === 'string') {
                    currentData.who_i_am[idx] = { text: currentData.who_i_am[idx], explanation: val };
                } else {
                    currentData.who_i_am[idx].explanation = val;
                }
                triggerAutoSave();
            });
            row.appendChild(expArea);

            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn-card';
            delBtn.textContent = 'Delete Paragraph';
            delBtn.onclick = () => removeItem(currentData.who_i_am, idx);
            row.appendChild(delBtn);

            formContainer.appendChild(row);
        });

        const addBtn = document.createElement('button');
        addBtn.className = 'add-btn';
        addBtn.textContent = '+ Add Paragraph';
        addBtn.onclick = () => addItem(currentData.who_i_am, { text: "New paragraph...", explanation: "" });
        formContainer.appendChild(addBtn);
    }

    if (['education', 'core_skills', 'strengths', 'weaknesses', 'philosophy', 'seeking'].includes(currentSection)) {
        const dataArray = currentData[currentSection];
        dataArray.forEach((item, idx) => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'flex-start';
            row.style.gap = '10px';
            row.style.marginBottom = '15px';

            const input = createFormGroup(`Item ${idx+1}`, 'textarea', item, (val) => {
                currentData[currentSection][idx] = val;
                triggerAutoSave();
            });
            input.style.flex = '1';
            row.appendChild(input);

            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn-sm';
            delBtn.style.marginTop = '28px';
            delBtn.textContent = 'X';
            delBtn.onclick = () => removeItem(currentData[currentSection], idx);
            row.appendChild(delBtn);

            formContainer.appendChild(row);
        });

        const addBtn = document.createElement('button');
        addBtn.className = 'add-btn';
        addBtn.textContent = '+ Add Item';
        addBtn.onclick = () => addItem(currentData[currentSection], "New item...");
        formContainer.appendChild(addBtn);
    }

    if (currentSection === 'sidebar_lists') {
        ['strengths', 'weaknesses', 'philosophy', 'seeking'].forEach(key => {
            const h = document.createElement('h3');
            h.textContent = key.toUpperCase();
            h.style.marginTop = '30px';
            h.style.marginBottom = '15px';
            formContainer.appendChild(h);

            currentData[key].forEach((item, idx) => {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.alignItems = 'flex-start';
                row.style.gap = '10px';
                row.style.marginBottom = '10px';

                const input = createFormGroup(`${key} ${idx+1}`, 'textarea', item, (val) => {
                    currentData[key][idx] = val;
                    triggerAutoSave();
                });
                input.style.flex = '1';
                row.appendChild(input);

                const delBtn = document.createElement('button');
                delBtn.className = 'delete-btn-sm';
                delBtn.style.marginTop = '28px';
                delBtn.textContent = 'X';
                delBtn.onclick = () => removeItem(currentData[key], idx);
                row.appendChild(delBtn);

                formContainer.appendChild(row);
            });

            const addBtn = document.createElement('button');
            addBtn.className = 'add-btn';
            addBtn.textContent = `+ Add ${key}`;
            addBtn.onclick = () => addItem(currentData[key], "New item...");
            formContainer.appendChild(addBtn);
        });
    }

    if (currentSection === 'skills') {
        ['skills_left', 'skills_right'].forEach(key => {
            const h = document.createElement('h3');
            h.textContent = key.replace('_', ' ').toUpperCase();
            h.style.marginTop = '20px';
            formContainer.appendChild(h);

            currentData[key].forEach((skill, idx) => {
                const row = document.createElement('div');
                row.className = 'dynamic-list-item';
                row.style.alignItems = 'center';
                row.style.marginBottom = '10px';
                
                const labelInput = document.createElement('input');
                labelInput.value = skill.label;
                labelInput.oninput = (e) => {
                    currentData[key][idx].label = e.target.value;
                    triggerAutoSave();
                };

                const pctInput = document.createElement('input');
                pctInput.style.width = '80px';
                pctInput.value = skill.pct;
                pctInput.oninput = (e) => {
                    currentData[key][idx].pct = e.target.value;
                    triggerAutoSave();
                };

                const delBtn = document.createElement('button');
                delBtn.className = 'delete-btn-sm';
                delBtn.textContent = 'X';
                delBtn.onclick = () => removeItem(currentData[key], idx);

                row.appendChild(labelInput);
                row.appendChild(pctInput);
                row.appendChild(delBtn);
                formContainer.appendChild(row);
            });

            const addBtn = document.createElement('button');
            addBtn.className = 'add-btn';
            addBtn.textContent = `+ Add Skill to ${key.replace('skills_', '')}`;
            addBtn.onclick = () => addItem(currentData[key], { label: "New Skill", pct: "50%" });
            formContainer.appendChild(addBtn);
        });

        // Add Final 100% field
        formContainer.appendChild(createFormGroup('Final Percentage Label (Bottom)', 'text', currentData.final_pct, (val) => {
            currentData.final_pct = val;
            triggerAutoSave();
        }));
    }

    if (currentSection === 'experience') {
        data.forEach((job, idx) => {
            const card = document.createElement('div');
            card.className = 'item-card';
            
            card.appendChild(createFormGroup('Job Title', 'text', job.title, (val) => { currentData.experience[idx].title = val; triggerAutoSave(); }));
            card.appendChild(createFormGroup('Meta (Location/Date)', 'text', job.meta, (val) => { currentData.experience[idx].meta = val; triggerAutoSave(); }));
            card.appendChild(createFormGroup('Popup Explanation', 'textarea', job.explanation, (val) => { currentData.experience[idx].explanation = val; triggerAutoSave(); }));
            
            const bulletLabel = document.createElement('label');
            bulletLabel.textContent = 'Performance Bullets';
            bulletLabel.style.display = 'block';
            bulletLabel.style.marginTop = '20px';
            bulletLabel.style.marginBottom = '10px';
            card.appendChild(bulletLabel);

            const bulletList = document.createElement('div');
            bulletList.style.display = 'flex';
            bulletList.style.flexDirection = 'column';
            bulletList.style.gap = '15px';

            job.bullets.forEach((bullet, bIdx) => {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.alignItems = 'flex-start';
                row.style.gap = '10px';

                const bInput = createFormGroup('', 'textarea', bullet, (val) => {
                    currentData.experience[idx].bullets[bIdx] = val;
                    triggerAutoSave();
                });
                bInput.style.flex = '1';
                row.appendChild(bInput);

                const delBulletBtn = document.createElement('button');
                delBulletBtn.className = 'delete-btn-sm';
                delBulletBtn.style.marginTop = '28px';
                delBulletBtn.textContent = 'X';
                delBulletBtn.onclick = () => removeItem(currentData.experience[idx].bullets, bIdx);
                row.appendChild(delBulletBtn);

                bulletList.appendChild(row);
            });

            const addBulletBtn = document.createElement('button');
            addBulletBtn.className = 'add-btn';
            addBulletBtn.textContent = '+ Add Bullet';
            addBulletBtn.onclick = () => addItem(currentData.experience[idx].bullets, "New achievement...");
            bulletList.appendChild(addBulletBtn);

            card.appendChild(bulletList);

            const delJobBtn = document.createElement('button');
            delJobBtn.className = 'delete-btn-card';
            delJobBtn.textContent = 'Delete Job Entry';
            delJobBtn.onclick = () => removeItem(currentData.experience, idx);
            card.appendChild(delJobBtn);

            formContainer.appendChild(card);
        });

        const addJobBtn = document.createElement('button');
        addJobBtn.className = 'add-btn';
        addJobBtn.style.padding = '20px';
        addJobBtn.style.fontSize = '18px';
        addJobBtn.textContent = '+ Add New Job Experience';
        addJobBtn.onclick = () => addItem(currentData.experience, {
            title: "New Company - New Role",
            meta: "Location | Dates",
            bullets: ["Managed key projects...", "Improved efficiency by X%"]
        });
        formContainer.appendChild(addJobBtn);
    }

    if (currentSection === 'spacing') {
        const defaults = { 
            lineHeight: 0.9, letterSpacing: -0.2, baseFs: 11,
            headerLh: 1.05, headerLs: -2, headerFs: 52,
            sectionLh: 1.1, sectionLs: -0.5, sectionFs: 18,
            jobLh: 1.2, jobLs: 0, jobFs: 14
        };
        
        if (!currentData.spacing) {
            currentData.spacing = { ...defaults };
        } else {
            // Merge in missing defaults
            Object.keys(defaults).forEach(key => {
                if (currentData.spacing[key] === undefined) {
                    currentData.spacing[key] = defaults[key];
                }
            });
        }

        const createSlider = (label, key, min, max, step, suffix = "") => {
            const group = document.createElement('div');
            group.className = 'form-group';
            group.style.marginBottom = '20px';
            group.innerHTML = `
                <label>${label}: <span id="${key}-val">${currentData.spacing[key]}</span>${suffix}</label>
                <input type="range" min="${min}" max="${max}" step="${step}" value="${currentData.spacing[key]}" style="width: 100%;">
            `;
            const slider = group.querySelector('input');
            slider.oninput = (e) => {
                currentData.spacing[key] = e.target.value;
                group.querySelector(`#${key}-val`).textContent = e.target.value;
                triggerAutoSave();
            };
            slider.onwheel = (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -step : parseFloat(step);
                let val = parseFloat(slider.value) + delta;
                val = Math.max(min, Math.min(max, val));
                slider.value = val;
                currentData.spacing[key] = val;
                group.querySelector(`#${key}-val`).textContent = val.toFixed(step < 1 ? 2 : 0);
                triggerAutoSave();
            };
            return group;
        };

        const sections = [
            { title: "Global Content Spacing", sliders: [
                { label: "Line Height", key: "lineHeight", min: 0.5, max: 2.5, step: 0.05 },
                { label: "Letter Spacing (px)", key: "letterSpacing", min: -2.0, max: 5.0, step: 0.1 },
                { label: "Font Size (px)", key: "baseFs", min: 8, max: 24, step: 1 }
            ]},
            { title: "Main Title (Header)", sliders: [
                { label: "Line Height", key: "headerLh", min: 0.5, max: 2.0, step: 0.05 },
                { label: "Letter Spacing (px)", key: "headerLs", min: -10.0, max: 10.0, step: 0.1 },
                { label: "Font Size (px)", key: "headerFs", min: 20, max: 100, step: 1 }
            ]},
            { title: "Section Headings", sliders: [
                { label: "Line Height", key: "sectionLh", min: 0.5, max: 2.0, step: 0.05 },
                { label: "Letter Spacing (px)", key: "sectionLs", min: -5.0, max: 5.0, step: 0.1 },
                { label: "Font Size (px)", key: "sectionFs", min: 10, max: 40, step: 1 }
            ]},
            { title: "Job Titles", sliders: [
                { label: "Line Height", key: "jobLh", min: 0.5, max: 2.0, step: 0.05 },
                { label: "Letter Spacing (px)", key: "jobLs", min: -5.0, max: 5.0, step: 0.1 },
                { label: "Font Size (px)", key: "jobFs", min: 8, max: 30, step: 1 }
            ]}
        ];

        sections.forEach(sec => {
            const h = document.createElement('h3');
            h.textContent = sec.title;
            h.style.marginBottom = '15px';
            if (formContainer.children.length > 0) h.style.marginTop = '30px';
            formContainer.appendChild(h);
            sec.sliders.forEach(s => {
                formContainer.appendChild(createSlider(s.label, s.key, s.min, s.max, s.step));
            });
        });
    }

    if (currentSection === 'layout') {
        const defaults = {
            colLeftWidth: 255, colMidWidth: 440, sidebarWidth: 315,
            gapLeftMid: 33, gapMidRight: 33, sectionMarginBottom: 25,
            headerMarginBottom: 35,
            mainAreaPaddingLeft: 45, mainAreaPaddingRight: 35,
            fullPageWidth: 1123,
            linksPaddingV: 3.5,
            linksPaddingH: 9,
            jobMarginBottom: 15,
            gapHeaderTitleLinks: 5,
            gapProfileInfo: 18,
            gapInfoSkills: 18,
            sidebarUnitGap: 22,
            part1Order: ['profile', 'technical_skills', 'core_skills'],
            part2Order: ['who_i_am', 'jobs'],
            part3Order: ['education', 'strengths', 'weaknesses', 'philosophy', 'seeking']
        };

        if (!currentData.layout) {
            currentData.layout = { ...defaults };
        } else {
            // Ensure all default properties exist to avoid NaN in calculations
            Object.keys(defaults).forEach(key => {
                if (currentData.layout[key] === undefined) {
                    currentData.layout[key] = defaults[key];
                }
            });
        }
        if (!currentData.layout.part1Order) currentData.layout.part1Order = [...defaults.part1Order];
        if (!currentData.layout.part2Order) currentData.layout.part2Order = [...defaults.part2Order];
        if (!currentData.layout.part3Order) currentData.layout.part3Order = [...defaults.part3Order];

        const layout = currentData.layout;
        const totalA4Height = 1587; // A4 height in pixels approx

        // Add Sliders for Layout (Only global ones, specific ones are in the visual editor stats)
        const layoutSliders = [
            { label: "Full Page Width", key: "fullPageWidth", min: 800, max: 2000, step: 1 }
        ];

        layoutSliders.forEach(s => {
            const group = document.createElement('div');
            group.className = 'form-group';
            group.style.marginBottom = '20px';
            group.innerHTML = `
                <label>${s.label}: <span id="${s.key}-val">${layout[s.key]}</span>px</label>
                <input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${layout[s.key]}" style="width: 100%;">
            `;
            const slider = group.querySelector('input');
            slider.oninput = (e) => {
                layout[s.key] = parseInt(e.target.value);
                group.querySelector(`#${s.key}-val`).textContent = e.target.value;
                updateLayoutUI();
                triggerAutoSave();
            };
            slider.onwheel = (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -s.step : s.step;
                let val = parseFloat(slider.value) + delta;
                val = Math.max(s.min, Math.min(s.max, val));
                slider.value = val;
                layout[s.key] = val;
                group.querySelector(`#${s.key}-val`).textContent = val;
                updateLayoutUI();
                triggerAutoSave();
            };
            formContainer.appendChild(group);
        });

        const visualContainer = document.createElement('div');
        visualContainer.className = 'visual-layout';
        
        const previewHeaderTitle = document.createElement('h3');
        previewHeaderTitle.textContent = 'Advanced Structural Editor';
        previewHeaderTitle.style.marginBottom = '10px';
        visualContainer.appendChild(previewHeaderTitle);

        // Zoom Button
        const zoomBtn = document.createElement('button');
        zoomBtn.className = 'zoom-btn';
        zoomBtn.textContent = 'Zoom Focus';
        zoomBtn.onclick = () => {
            visualContainer.classList.toggle('zoomed');
            zoomBtn.textContent = visualContainer.classList.contains('zoomed') ? 'Close Zoom' : 'Zoom Focus';
        };
        visualContainer.appendChild(zoomBtn);

        const instructions = document.createElement('p');
        instructions.className = 'text-block';
        instructions.style.fontSize = '12px';
        instructions.style.marginBottom = '20px';
        instructions.style.color = 'var(--text-secondary)';
        instructions.innerHTML = 'Drag <strong>dividers</strong> for columns/gaps, <strong>title handle</strong> for header, or <strong>blocks</strong> to reorder content.';
        visualContainer.appendChild(instructions);

        // Preview Area
        const previewArea = document.createElement('div');
        previewArea.className = 'layout-preview-container';
        
        // Header Section
        const headerArea = document.createElement('div');
        headerArea.className = 'preview-header-area';
        
        const titleBox = document.createElement('div');
        titleBox.className = 'preview-title-box';
        titleBox.innerHTML = 'MAIN TITLE';
        
        const titleHandle = document.createElement('div');
        titleHandle.className = 'title-handle';
        titleHandle.dataset.handle = 'headerTitleWidth';
        titleHandle.dataset.label = 'Title Width';
        titleBox.appendChild(titleHandle);

        const headerGapHandle = document.createElement('div');
        headerGapHandle.className = 'layout-divider horizontal';
        headerGapHandle.dataset.handle = 'gapHeaderTitleLinks';
        headerGapHandle.dataset.label = 'Title/Links Gap';
        headerGapHandle.style.height = '12px'; // Visual handle
        
        const contactBox = document.createElement('div');
        contactBox.className = 'layout-box';
        contactBox.style.fontSize = '8px';
        contactBox.style.color = '#444';
        contactBox.style.textAlign = 'right';
        contactBox.style.padding = '2px';
        contactBox.dataset.label = 'Links Padding (V/H)';
        contactBox.innerHTML = 'CONTACT LINKS';
        // Add a handle inside if we want, but slider is safer for small values
        
        headerArea.appendChild(titleBox);
        headerArea.appendChild(headerGapHandle);
        headerArea.appendChild(contactBox);
        
        // Add click to edit for header
        headerArea.style.cursor = 'pointer';
        headerArea.onclick = () => openEditModal('header');
        
        const headerDivider = document.createElement('div');
        headerDivider.className = 'layout-divider horizontal';
        headerDivider.dataset.handle = 'headerMarginBottom';
        headerDivider.dataset.label = 'Header Margin';

        // Main Content Area
        const mainContent = document.createElement('div');
        mainContent.className = 'preview-main-content';

        const col1 = document.createElement('div');
        col1.className = 'preview-col preview-col-1';
        
        const divGap1 = document.createElement('div');
        divGap1.className = 'layout-divider vertical';
        divGap1.dataset.handle = 'gapLeftMid';
        divGap1.dataset.label = 'Gap 1';

        const divColLeft = document.createElement('div');
        divColLeft.className = 'layout-divider vertical';
        divColLeft.dataset.handle = 'colLeftWidth';
        divColLeft.dataset.label = 'Col 1 Width';

        const col2 = document.createElement('div');
        col2.className = 'preview-col preview-col-2';
        
        const divGap2 = document.createElement('div');
        divGap2.className = 'layout-divider vertical';
        divGap2.dataset.handle = 'gapMidRight';
        divGap2.dataset.label = 'Gap 2';

        const divColMid = document.createElement('div');
        divColMid.className = 'layout-divider vertical';
        divColMid.dataset.handle = 'colMidWidth';
        divColMid.dataset.label = 'Col 2 Width';

        const col3 = document.createElement('div');
        col3.className = 'preview-col preview-col-3';

        // Overflow Indicator
        const overflowLine = document.createElement('div');
        overflowLine.className = 'overflow-line';
        overflowLine.innerHTML = '<div class="overflow-label">A4 PAGE LIMIT</div>';

        // Margin Lines
        const leftMarginLine = document.createElement('div');
        leftMarginLine.className = 'margin-line vertical';
        leftMarginLine.dataset.handle = 'mainAreaPaddingLeft';
        leftMarginLine.dataset.label = 'Left Padding';
        // Group Header and Main Content to apply Gap 2 globally in visual editor
        const leftMainGroup = document.createElement('div');
        leftMainGroup.className = 'left-main-group';
        // Styles moved to editor.css

        leftMainGroup.appendChild(headerArea);
        leftMainGroup.appendChild(headerDivider);
        leftMainGroup.appendChild(mainContent);

        mainContent.appendChild(leftMarginLine);
        mainContent.appendChild(col1);
        mainContent.appendChild(divColLeft);
        mainContent.appendChild(divGap1);
        mainContent.appendChild(col2);
        mainContent.appendChild(divColMid);

        previewArea.appendChild(leftMainGroup);
        previewArea.appendChild(divGap2);
        previewArea.appendChild(col3);
        previewArea.appendChild(overflowLine);

        // Page Width Handle (at the very right)
        const pageWidthHandle = document.createElement('div');
        pageWidthHandle.className = 'layout-divider vertical';
        pageWidthHandle.dataset.handle = 'fullPageWidth';
        pageWidthHandle.dataset.label = 'Page Width';
        pageWidthHandle.style.position = 'absolute';
        pageWidthHandle.style.right = '-2px';
        pageWidthHandle.style.height = '100%';
        pageWidthHandle.style.zIndex = '15';
        previewArea.appendChild(pageWidthHandle);

        visualContainer.appendChild(previewArea);

        // Edit Modal Functionality
        const openEditModal = (sectionId) => {
            const overlay = document.createElement('div');
            overlay.className = 'edit-modal-overlay';
            
            const modal = document.createElement('div');
            modal.className = 'edit-modal';
            modal.innerHTML = `<h2>Edit ${sectionId.replace('_',' ').toUpperCase()}</h2>`;

            const content = document.createElement('div');
            content.className = 'editor-form';
            modal.appendChild(content);

            // Temporarily redirect renderForm to this modal content
            const originalContainer = formContainer;
            const originalSection = currentSection;
            
            // We need a way to render just the section fields without the visual editor
            const renderFieldsOnly = (target, section) => {
                target.innerHTML = '';
                
                // Header (Title + Links)
                if (section === 'header') {
                    target.appendChild(createFormGroup('Resume Title', 'text', currentData.header.title, v => { currentData.header.title = v; triggerAutoSave(); }));
                    const h = document.createElement('h3'); h.textContent = "Links"; target.appendChild(h);
                    currentData.header.links.forEach((l, i) => {
                        const row = document.createElement('div'); row.className = 'dynamic-list-item';
                        const inpL = document.createElement('input'); inpL.value = l.label; inpL.oninput = (e) => { currentData.header.links[i].label = e.target.value; triggerAutoSave(); };
                        const inpU = document.createElement('input'); inpU.value = l.url; inpU.oninput = (e) => { currentData.header.links[i].url = e.target.value; triggerAutoSave(); };
                        row.appendChild(inpL); row.appendChild(inpU); target.appendChild(row);
                    });
                } 
                // Bio / Paragraphs
                else if (section === 'who_i_am') {
                    currentData.who_i_am.forEach((p, idx) => {
                         const container = document.createElement('div');
                         container.className = 'item-card';
                         const textVal = p.text || p;
                         const expVal = p.explanation || "";
                         container.appendChild(createFormGroup(`Paragraph ${idx+1}`, 'textarea', textVal, v => { 
                             if (typeof currentData.who_i_am[idx] === 'string') currentData.who_i_am[idx] = {text:v, explanation:expVal};
                             else currentData.who_i_am[idx].text = v;
                             triggerAutoSave();
                         }));
                         container.appendChild(createFormGroup(`Popup Explanation`, 'textarea', expVal, v => { 
                             if (typeof currentData.who_i_am[idx] === 'string') currentData.who_i_am[idx] = {text:textVal, explanation:v};
                             else currentData.who_i_am[idx].explanation = v;
                             triggerAutoSave();
                         }));
                         target.appendChild(container);
                    });
                } 
                // Experience
                else if (section === 'experience') {
                    currentData.experience.forEach((job, idx) => {
                        const card = document.createElement('div');
                        card.className = 'item-card';
                        card.appendChild(createFormGroup('Job Title', 'text', job.title, v => { currentData.experience[idx].title = v; triggerAutoSave(); }));
                        card.appendChild(createFormGroup('Meta', 'text', job.meta, v => { currentData.experience[idx].meta = v; triggerAutoSave(); }));
                        card.appendChild(createFormGroup('Popup Explanation', 'textarea', job.explanation, v => { currentData.experience[idx].explanation = v; triggerAutoSave(); }));
                        
                        const bLabel = document.createElement('label'); bLabel.textContent = "Bullets"; card.appendChild(bLabel);
                        job.bullets.forEach((b, bi) => {
                            card.appendChild(createFormGroup('', 'textarea', b, v => { currentData.experience[idx].bullets[bi] = v; triggerAutoSave(); }));
                        });
                        target.appendChild(card);
                    });
                }
                // Skills Matrices
                else if (section === 'profile' || section === 'technical_skills' || section === 'core_skills') {
                    const keys = section === 'profile' ? ['skills_left'] : 
                                 section === 'technical_skills' ? ['skills_right'] : 
                                 ['core_skills'];
                    
                    if (section === 'profile') {
                         target.appendChild(createFormGroup('Profile Name', 'text', currentData.personal.name, v => { currentData.personal.name = v; triggerAutoSave(); }));
                    }

                    keys.forEach(k => {
                        const items = currentData[k] || [];
                        items.forEach((skill, si) => {
                            if (typeof skill === 'object' && skill.label !== undefined) {
                                const row = document.createElement('div'); row.className = 'dynamic-list-item';
                                const inpL = document.createElement('input'); inpL.value = skill.label; inpL.oninput = (e) => { currentData[k][si].label = e.target.value; triggerAutoSave(); };
                                const inpP = document.createElement('input'); inpP.style.width = '60px'; inpP.value = skill.pct; inpP.oninput = (e) => { currentData[k][si].pct = e.target.value; triggerAutoSave(); };
                                row.appendChild(inpL); row.appendChild(inpP); target.appendChild(row);
                            } else {
                                target.appendChild(createFormGroup(`Item ${si+1}`, 'textarea', skill, v => { currentData[k][si] = v; triggerAutoSave(); }));
                            }
                        });
                    });
                }
                // Sidebar Units
                else if (section === 'sidebar_lists') {
                    ['education', 'strengths', 'weaknesses', 'philosophy', 'seeking'].forEach(key => {
                        const h = document.createElement('h4'); h.textContent = key.toUpperCase(); target.appendChild(h);
                        const items = currentData[key] || [];
                        items.forEach((item, ii) => {
                            target.appendChild(createFormGroup('', 'textarea', item, v => { currentData[key][ii] = v; triggerAutoSave(); }));
                        });
                    });
                }
            };

            renderFieldsOnly(content, sectionId);

            const footer = document.createElement('div');
            footer.className = 'modal-footer';
            
            const closeBtn = document.createElement('button');
            closeBtn.className = 'modal-btn save';
            closeBtn.textContent = 'Done';
            closeBtn.onclick = () => {
                document.body.removeChild(overlay);
                renderForm(); // Refresh main view
            };
            
            footer.appendChild(closeBtn);
            modal.appendChild(footer);
            overlay.appendChild(modal);
            
            // Close on background click
            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    document.body.removeChild(overlay);
                    renderForm();
                }
            };
            
            document.body.appendChild(overlay);
        };

        // Helper to render section blocks
        const renderSectionBlocks = () => {
            col1.innerHTML = ''; col2.innerHTML = ''; col3.innerHTML = '';

            // PART 1 (Left Column)
            currentData.layout.part1Order.forEach((id, idx) => {
                const block = document.createElement('div');
                block.className = 'section-block';
                block.innerHTML = `<span><b>${id.replace('_',' ').toUpperCase()}</b></span><div class="reorder-handle"></div>`;
                block.draggable = true;
                block.dataset.id = id;
                block.dataset.type = 'part1';
                col1.appendChild(block);

                // Click to edit
                block.onclick = (e) => {
                    if (e.target.classList.contains('reorder-handle')) return;
                    openEditModal(id);
                };

                // Add grid separator (gap control) between blocks
                if (idx < currentData.layout.part1Order.length - 1) {
                    const sep = document.createElement('div');
                    sep.className = 'layout-divider horizontal';
                    // Map specific gaps if possible, or use a general one for part 1
                    sep.dataset.handle = id === 'profile' ? 'gapProfileInfo' : 'gapInfoSkills';
                    sep.dataset.label = id === 'profile' ? 'Profile Gap' : 'Skills Gap';
                    col1.appendChild(sep);
                }
            });

            // PART 2 (Middle Column)
            if (!currentData.layout.part2Order || currentData.layout.part2Order.length === 0) {
                currentData.layout.part2Order = ['who_i_am', 'jobs'];
            }

            currentData.layout.part2Order.forEach((item, idx) => {
                if (item === 'who_i_am') {
                    const block = document.createElement('div');
                    block.className = 'section-block';
                    block.style.borderLeft = '3px solid var(--accent)';
                    block.innerHTML = `<span><b>WHO I AM</b> (Bio)</span><div class="reorder-handle"></div>`;
                    block.draggable = true;
                    block.dataset.id = 'who_i_am';
                    block.dataset.type = 'part2';
                    col2.appendChild(block);
                    block.onclick = () => openEditModal('who_i_am');
                } else if (item === 'jobs') {
                    if (currentData.experience && Array.isArray(currentData.experience)) {
                        currentData.experience.forEach((job, jobIdx) => {
                            const block = document.createElement('div');
                            block.className = 'section-block';
                            block.innerHTML = `<span>${job.title || 'Job Title'}</span><div class="reorder-handle"></div>`;
                            block.draggable = true;
                            block.dataset.index = jobIdx;
                            block.dataset.type = 'job';
                            col2.appendChild(block);
                            block.onclick = () => openEditModal('experience');

                            if (jobIdx < currentData.experience.length - 1) {
                                const sep = document.createElement('div');
                                sep.className = 'layout-divider horizontal spacing-handle';
                                sep.dataset.handle = 'jobMarginBottom';
                                sep.dataset.label = 'Job Spacing';
                                col2.appendChild(sep);
                            }
                        });
                    }
                }

                if (idx < currentData.layout.part2Order.length - 1) {
                    const sep = document.createElement('div');
                    sep.className = 'layout-divider horizontal';
                    sep.dataset.handle = 'sectionMarginBottom';
                    sep.dataset.label = 'Section Margin';
                    col2.appendChild(sep);
                }
            });

            // PART 3 (Right Column / Sidebar)
            currentData.layout.part3Order.forEach((id, idx) => {
                const block = document.createElement('div');
                block.className = 'section-block';
                block.style.background = '#222';
                block.innerHTML = `<span><b>${id.toUpperCase()}</b></span><div class="reorder-handle"></div>`;
                block.draggable = true;
                block.dataset.id = id;
                block.dataset.type = 'part3';
                col3.appendChild(block);
                block.onclick = () => openEditModal('sidebar_lists');

                if (idx < currentData.layout.part3Order.length - 1) {
                    const sep = document.createElement('div');
                    sep.className = 'layout-divider horizontal';
                    sep.dataset.handle = 'sidebarUnitGap';
                    sep.dataset.label = 'Side Gap';
                    col3.appendChild(sep);
                }
            });
        };

        renderSectionBlocks();

        // Stats Display
        const statsRow1 = document.createElement('div');
        statsRow1.className = 'layout-stats';
        statsRow1.style.marginTop = '15px';
        statsRow1.style.display = 'flex';
        statsRow1.style.flexWrap = 'wrap';
        statsRow1.style.gap = '10px';
        statsRow1.innerHTML = `
            <span>Col1: <b id="stat-colLeftWidth"></b>px</span>
            <span>Gap1: <b id="stat-gapLeftMid"></b>px</span>
            <span>Col2: <b id="stat-colMidWidth"></b>px</span>
            <span>Gap2: <b id="stat-gapMidRight"></b>px</span>
            <span>Side: <b id="stat-sidebarWidth"></b>px</span>
        `;
        visualContainer.appendChild(statsRow1);

        const statsRow2 = document.createElement('div');
        statsRow2.className = 'layout-stats';
        statsRow2.style.display = 'flex';
        statsRow2.style.flexWrap = 'wrap';
        statsRow2.style.gap = '10px';
        statsRow2.innerHTML = `
            <span>Title/Lnk: <b id="stat-gapHeaderTitleLinks"></b>px</span>
            <span>Prf/Inf: <b id="stat-gapProfileInfo"></b>px</span>
            <span>Inf/Skl: <b id="stat-gapInfoSkills"></b>px</span>
            <span>LinksPad: V:<b id="stat-linksPaddingV"></b> H:<b id="stat-linksPaddingH"></b></span>
            <span>JobGap: <b id="stat-jobMarginBottom"></b>px</span>
            <span>SideGap: <b id="stat-sidebarUnitGap"></b>px</span>
            <span>Paddings: L:<b id="stat-mainAreaPaddingLeft"></b>px</span>
        `;
        visualContainer.appendChild(statsRow2);

        // Hover Highlight logic for stats
        visualContainer.querySelectorAll('.layout-stats span').forEach(span => {
            const b = span.querySelector('b');
            if (!b) return;
            const key = b.id.replace('stat-', '');
            span.onmouseenter = () => {
                const handle = visualContainer.querySelector(`[data-handle="${key}"]`);
                if (handle) handle.classList.add('highlight-flash');
                else if (key === 'sidebarWidth') col3.classList.add('highlight-flash');
                else if (key.includes('linksPadding')) contactBox.classList.add('highlight-flash');
                else if (key === 'jobMarginBottom') {
                    visualContainer.querySelectorAll('.spacing-handle').forEach(h => h.classList.add('highlight-flash'));
                }
            };
            span.onmouseleave = () => {
                const handle = visualContainer.querySelector(`[data-handle="${key}"]`);
                if (handle) handle.classList.remove('highlight-flash');
                else if (key === 'sidebarWidth') col3.classList.remove('highlight-flash');
                else if (key.includes('linksPadding')) contactBox.classList.remove('highlight-flash');
                else if (key === 'jobMarginBottom') {
                    visualContainer.querySelectorAll('.spacing-handle').forEach(h => h.classList.remove('highlight-flash'));
                }
            };
        });

        formContainer.appendChild(visualContainer);

        const updateLayoutUI = () => {
            const containerWidth = previewArea.offsetWidth;
            if (!containerWidth) return; 
            const totalA4Width = layout.fullPageWidth || 1123;
            const ratio = (containerWidth / totalA4Width) || 0.3;
            if (ratio <= 0) return;

            const padL = (layout.mainAreaPaddingLeft || 0) * ratio;
            const col1W = (layout.colLeftWidth || 0) * ratio;
            const gap1W = (layout.gapLeftMid || 0) * ratio;
            const col2W = (layout.colMidWidth || 0) * ratio;
            const gap2W = (layout.gapMidRight || 0) * ratio;
            
            // Absolute Positioning
            col1.style.left = (padL) + 'px';
            col1.style.width = col1W + 'px';
            
            divColLeft.style.left = (padL + col1W - 12) + 'px';
            
            divGap1.style.left = (padL + col1W) + 'px';
            divGap1.style.width = gap1W + 'px';
            
            col2.style.left = (padL + col1W + gap1W) + 'px';
            col2.style.width = col2W + 'px';
            
            divColMid.style.left = (padL + col1W + gap1W + col2W - 12) + 'px';
            
            divGap2.style.left = (padL + col1W + gap1W + col2W) + 'px';
            divGap2.style.width = gap2W + 'px';

            const leftGroupW = padL + col1W + gap1W + col2W;
            leftMainGroup.style.width = leftGroupW + 'px';
            
            const sidebarW_px = (totalA4Width * ratio) - leftGroupW - gap2W;
            col3.style.left = (leftGroupW + gap2W) + 'px';
            col3.style.width = Math.max(0, sidebarW_px) + 'px';

            // Sidebar Internal Stats (px)
            layout.sidebarWidth = (totalA4Width - (layout.colLeftWidth + layout.gapLeftMid + layout.colMidWidth) - (layout.gapMidRight || 0));

            // Header Ratios
            titleBox.style.width = (layout.headerTitleWidth * ratio) + 'px';
            headerDivider.style.height = Math.max(8, layout.headerMarginBottom * ratio) + 'px';
            
            visualContainer.querySelectorAll('.layout-divider.horizontal[data-handle]').forEach(h => {
                const k = h.dataset.handle;
                if (layout[k] !== undefined) {
                    h.style.height = Math.max(8, layout[k] * ratio) + 'px';
                }
            });

            leftMarginLine.style.left = (layout.mainAreaPaddingLeft * ratio) + 'px';

            // Stats Update
            const statKeys = ['colLeftWidth', 'colMidWidth', 'sidebarWidth', 'gapLeftMid', 'gapMidRight', 
                             'headerTitleWidth', 'headerMarginBottom', 'mainAreaPaddingLeft', 
                             'gapHeaderTitleLinks', 'gapProfileInfo', 'gapInfoSkills', 
                             'sidebarUnitGap', 'jobMarginBottom', 'linksPaddingV', 'linksPaddingH'];
            
            statKeys.forEach(id => {
                const el = visualContainer.querySelector(`#stat-${id}`);
                if (el) el.textContent = Math.round(layout[id] || 0);
            });

            overflowLine.style.top = (794 * ratio) + 'px';
        };

        const obs = new ResizeObserver(updateLayoutUI);
        obs.observe(previewArea);
        setTimeout(updateLayoutUI, 50); // Initial kick

        let activeHandle = null;
        let startX, startY, startVal;

        const onPointerDown = (e) => {
            const handle = e.target.closest('[data-handle]');
            if (handle) {
                activeHandle = handle;
                activeHandle.classList.add('active');
                startX = e.clientX;
                startY = e.clientY;
                startVal = layout[activeHandle.dataset.handle];
                document.body.style.cursor = activeHandle.classList.contains('horizontal') || activeHandle.classList.contains('spacing-handle') ? 'row-resize' : 'col-resize';
                e.preventDefault();
            }
        };

        const onPointerMove = (e) => {
            if (!activeHandle) return;
            const key = activeHandle.dataset.handle;
            const totalA4Width = layout.fullPageWidth || 1123;
            const ratio = previewArea.offsetWidth / totalA4Width;
            let val = startVal;

            if (activeHandle.classList.contains('vertical') || activeHandle.classList.contains('title-handle') || activeHandle.classList.contains('margin-line')) {
                const dx = (e.clientX - startX) / ratio;
                val += dx;
                
                // Smart Snapping Logic
                if (e.shiftKey) {
                    val = Math.round(val / 5) * 5; // To nearest 5px
                    // Grid snapping logic (approximate common percentages of 1123)
                    const commonGrids = [0, 280, 374, 560, 748, 840]; // 25%, 33%, 50%, 66%, 75%
                    commonGrids.forEach(g => {
                        if (Math.abs(val - g) < 15) val = g;
                    });
                }
                
                if (key === 'colLeftWidth') layout[key] = Math.max(50, Math.min(500, val));
                if (key === 'colMidWidth') layout[key] = Math.max(100, Math.min(800, val));
                if (key === 'gapLeftMid' || key === 'gapMidRight') layout[key] = Math.max(0, Math.min(150, val));
                if (key === 'headerTitleWidth') layout[key] = Math.max(100, Math.min(1000, val));
                if (key === 'mainAreaPaddingLeft') layout[key] = Math.max(0, Math.min(150, val));
                if (key === 'fullPageWidth') layout[key] = Math.max(800, Math.min(2000, val));
                if (key === 'linksPaddingH') layout[key] = Math.max(0, Math.min(50, val));
            } else {
                const dy = (e.clientY - startY) / ratio;
                val += dy;
                if (e.shiftKey) val = Math.round(val / 5) * 5;

                if (key === 'sectionMarginBottom') layout[key] = Math.max(0, Math.min(100, val));
                if (key === 'headerMarginBottom') layout[key] = Math.max(0, Math.min(150, val));
                if (key === 'sidebarUnitGap') layout[key] = Math.max(0, Math.min(100, val));
                if (key === 'gapHeaderTitleLinks') layout[key] = Math.max(0, Math.min(100, val));
                if (key === 'gapProfileInfo') layout[key] = Math.max(0, Math.min(100, val));
                if (key === 'gapInfoSkills') layout[key] = Math.max(0, Math.min(100, val));
                if (key === 'linksPaddingV') layout[key] = Math.max(0, Math.min(30, val));
                if (key === 'jobMarginBottom') layout[key] = Math.max(0, Math.min(100, val));
            }

            updateLayoutUI();
            triggerAutoSave();
        };

        const onPointerUp = () => {
            if (activeHandle) {
                activeHandle.classList.remove('active');
                activeHandle = null;
                document.body.style.cursor = 'default';
            }
        };

        previewArea.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);

        // Precision Scroll Adjust
        visualContainer.addEventListener('wheel', (e) => {
            const handle = e.target.closest('[data-handle]');
            const statPill = e.target.closest('span');
            const targetB = e.target.closest('b[id^="stat-"]'); // Specific target detection
            let key = null;

            if (handle) {
                key = handle.dataset.handle;
            } else if (targetB) {
                key = targetB.id.replace('stat-', '');
            } else if (statPill) {
                const b = statPill.querySelector('b[id^="stat-"]');
                if (b) key = b.id.replace('stat-', '');
            }

            if (key && (layout[key] !== undefined || key === 'sidebarWidth')) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -1 : 1;
                const factor = (key.includes('Padding') && !key.includes('Left')) ? 0.5 : 1;
                
                // Sidebar adjustment fix: adjust layout.colMidWidth instead since sidebar is computed
                if (key === 'sidebarWidth') {
                    const totalA4Width = layout.fullPageWidth || 1123;
                    const leftSideW = layout.colLeftWidth + layout.gapLeftMid + layout.colMidWidth;
                    const gap2W = layout.gapMidRight || 0;
                    
                    // To INCREASE sidebar width (delta +1), we must DECREASE colMidWidth
                    // To DECREASE sidebar width (delta -1), we must INCREASE colMidWidth
                    let newVal = layout.colMidWidth - delta; 
                    layout.colMidWidth = Math.max(100, Math.min(800, newVal));
                } else {
                    let val = parseFloat(layout[key]) + (delta * factor);

                    // Apply constraints
                    if (key === 'colLeftWidth') val = Math.max(50, Math.min(500, val));
                    else if (key === 'colMidWidth') val = Math.max(100, Math.min(800, val));
                    else if (key === 'fullPageWidth') val = Math.max(800, Math.min(2000, val));
                    else if (key.includes('Padding')) val = Math.max(0, Math.min(50, val));
                    else if (key.includes('gap') || key.includes('Margin') || key.includes('Gap')) val = Math.max(0, Math.min(150, val));

                    layout[key] = val;
                }
                
                updateLayoutUI();
                triggerAutoSave();
            }
        }, { passive: false });

        // DRAG & DROP REORDERING
        let draggedItem = null;
        previewArea.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('section-block')) {
                draggedItem = e.target;
                e.target.classList.add('dragging');
            }
        });

        previewArea.addEventListener('dragend', (e) => {
            if (draggedItem) {
                draggedItem.classList.remove('dragging');
                draggedItem = null;
            }
        });

        previewArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = getDragAfterElement(e.target.closest('.preview-col'), e.clientY);
            const container = e.target.closest('.preview-col');
            if (container && draggedItem) {
                if (afterElement == null) {
                    container.appendChild(draggedItem);
                } else {
                    container.insertBefore(draggedItem, afterElement);
                }
            }
        });

        previewArea.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!draggedItem) return;

            const type = draggedItem.dataset.type;
            const itemIdx = draggedItem.dataset.index;
            const itemId = draggedItem.dataset.id;

            if (type === 'job') {
                const jobs = [...currentData.experience];
                const fromIndex = parseInt(itemIdx);
                const jobBlocks = Array.from(col2.querySelectorAll('.section-block[data-type="job"]'));
                const newIndex = jobBlocks.indexOf(draggedItem);
                
                if (fromIndex !== -1 && newIndex !== -1 && fromIndex !== newIndex) {
                    const [removed] = jobs.splice(fromIndex, 1);
                    jobs.splice(newIndex, 0, removed);
                    currentData.experience = jobs;
                }
            } else if (type === 'part1') {
                const order = [...currentData.layout.part1Order];
                const fromId = draggedItem.dataset.id;
                const newIndex = Array.from(col1.querySelectorAll('.section-block[data-type="part1"]')).indexOf(draggedItem);
                const oldIndex = order.indexOf(fromId);
                if (oldIndex !== newIndex && newIndex !== -1) {
                    const [removed] = order.splice(oldIndex, 1);
                    order.splice(newIndex, 0, removed);
                    currentData.layout.part1Order = order;
                }
            } else if (type === 'part2') {
                const order = [...currentData.layout.part2Order];
                const fromId = draggedItem.dataset.id;
                const blocks = Array.from(col2.querySelectorAll('.section-block[data-type="part2"], .section-block[data-type="job"]'));
                // Note: Part 2 is tricky because jobs are interleaved.
                // For simplicity, let's allow 'who_i_am' to be moved relative to the 'jobs' placeholder
                const newIndex = blocks.indexOf(draggedItem);
                const jobPlaceholderIndex = order.indexOf('jobs');
                const whoIAmIndex = order.indexOf('who_i_am');

                // Determine if who_i_am is before or after ALL jobs
                const firstJobInDom = col2.querySelector('.section-block[data-type="job"]');
                const whoIAmInDom = col2.querySelector('.section-block[data-id="who_i_am"]');
                
                if (whoIAmInDom && firstJobInDom) {
                    const isBefore = whoIAmInDom.compareDocumentPosition(firstJobInDom) & Node.DOCUMENT_POSITION_FOLLOWING;
                    currentData.layout.part2Order = isBefore ? ['who_i_am', 'jobs'] : ['jobs', 'who_i_am'];
                }
            } else if (type === 'part3') {
                const order = [...currentData.layout.part3Order];
                const fromId = draggedItem.dataset.id;
                const newIndex = Array.from(col3.querySelectorAll('.section-block[data-type="part3"]')).indexOf(draggedItem);
                const oldIndex = order.indexOf(fromId);
                if (oldIndex !== newIndex && newIndex !== -1) {
                    const [removed] = order.splice(oldIndex, 1);
                    order.splice(newIndex, 0, removed);
                    currentData.layout.part3Order = order;
                }
            }

            renderSectionBlocks();
            triggerAutoSave();
        });

        function getDragAfterElement(container, y) {
            if (!container) return null;
            const draggableElements = [...container.querySelectorAll('.section-block:not(.dragging)')];
            return draggableElements.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2;
                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: child };
                } else {
                    return closest;
                }
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        }
    }
}

// Formatting helper (Obsolesced by contenteditable)


// Helper to create form group
function createFormGroup(label, type, value, oninput) {
    const group = document.createElement('div');
    group.className = 'form-group';
    
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    
    if (label) {
        const lbl = document.createElement('label');
        lbl.textContent = label;
        header.appendChild(lbl);
    } else {
        header.style.justifyContent = 'flex-end';
        header.style.marginBottom = '2px';
    }

    const input = document.createElement('div');
    input.contentEditable = true;
    input.innerHTML = value || '';
    
    // Formatting Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'form-toolbar';

    const tools = [
        { label: 'B', cmd: 'bold', class: 'btn-b' },
        { label: 'I', cmd: 'italic', class: 'btn-i' },
        { label: 'U', cmd: 'underline', class: 'btn-u' }
    ];

    tools.forEach(tool => {
        const btn = document.createElement('button');
        btn.className = `format-btn ${tool.class}`;
        btn.textContent = tool.label;
        btn.onclick = (e) => {
            e.preventDefault();
            document.execCommand(tool.cmd, false, null);
            oninput(input.innerHTML);
            triggerAutoSave();
        };
        toolbar.appendChild(btn);
    });

    header.appendChild(toolbar);
    group.appendChild(header);

    input.oninput = (e) => oninput(e.target.innerHTML);
    
    // Clean paste
    input.onpaste = (e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
    };

    // If it's a "single line" field, prevent Enter key
    if (type !== 'textarea') {
        input.style.minHeight = '48px';
        input.onkeydown = (e) => {
            if (e.key === 'Enter') e.preventDefault();
        };
    }

    group.appendChild(input);
    return group;
}

// Load data
onValue(resumeRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
        currentData = data;
        // ONLY re-render if the update didn't come from this local editor
        if (!isLocalUpdate) {
            renderForm();
        }
    } else {
        seedData();
    }
}, (error) => {
    showStatus('Error loading: ' + error.message, 'error');
});

async function seedData() {
    try {
        const response = await fetch('initial-data.json');
        const initial = await response.json();
        await set(resumeRef, initial);
        showStatus('Seeded initial data');
    } catch (e) {
        showStatus('Seeding failed', 'error');
    }
}
