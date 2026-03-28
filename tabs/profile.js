import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { firebaseConfig } from "../data/firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const resumeRef = ref(db, 'resume');

onValue(resumeRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    // Apply Global Spacing
    if (data.spacing) {
        const root = document.documentElement;
        // Spacing
        root.style.setProperty('--base-lh', data.spacing.lineHeight);
        root.style.setProperty('--base-ls', data.spacing.letterSpacing + 'px');
        root.style.setProperty('--header-lh', data.spacing.headerLh);
        root.style.setProperty('--header-ls', data.spacing.headerLs + 'px');
        root.style.setProperty('--section-lh', data.spacing.sectionLh);
        root.style.setProperty('--section-ls', data.spacing.sectionLs + 'px');
        root.style.setProperty('--job-lh', data.spacing.jobLh || 1.2);
        root.style.setProperty('--job-ls', (data.spacing.jobLs || 0) + 'px');
        
        // Font Sizes
        root.style.setProperty('--base-fs', (data.spacing.baseFs || 11) + 'px');
        root.style.setProperty('--header-fs', (data.spacing.headerFs || 52) + 'px');
        root.style.setProperty('--section-fs', (data.spacing.sectionFs || 18) + 'px');
        root.style.setProperty('--job-fs', (data.spacing.jobFs || 14) + 'px');
    }

    // Apply Layout
    if (data.layout) {
        const root = document.documentElement;
        root.style.setProperty('--col-left-width', (data.layout.colLeftWidth || 255) + 'px');
        root.style.setProperty('--col-mid-width', (data.layout.colMidWidth || 440) + 'px');
        root.style.setProperty('--sidebar-width', (data.layout.sidebarWidth || 315) + 'px');
        root.style.setProperty('--resume-width', (data.layout.fullPageWidth || 1123) + 'px');
        root.style.setProperty('--gap-left-mid', (data.layout.gapLeftMid || 33) + 'px');
        root.style.setProperty('--gap-mid-right', (data.layout.gapMidRight || 33) + 'px');
        root.style.setProperty('--section-margin-bottom', (data.layout.sectionMarginBottom || 25) + 'px');
        root.style.setProperty('--header-margin-bottom', (data.layout.headerMarginBottom || 35) + 'px');
        root.style.setProperty('--main-area-padding-left', (data.layout.mainAreaPaddingLeft || 45) + 'px');
        root.style.setProperty('--links-padding-v', (data.layout.linksPaddingV || 3.5) + 'px');
        root.style.setProperty('--links-padding-h', (data.layout.linksPaddingH || 9) + 'px');
        root.style.setProperty('--job-margin-bottom', (data.layout.jobMarginBottom || 15) + 'px');
        root.style.setProperty('--header-title-width', (data.layout.headerTitleWidth || 700) + 'px');
        root.style.setProperty('--gap-header-title-links', (data.layout.gapHeaderTitleLinks || 5) + 'px');
        root.style.setProperty('--gap-profile-info', (data.layout.gapProfileInfo || 18) + 'px');
        root.style.setProperty('--gap-info-skills', (data.layout.gapInfoSkills || 18) + 'px');
        root.style.setProperty('--sidebar-unit-gap', (data.layout.sidebarUnitGap || 22) + 'px');

        // Reorder Part 1 Sections (Left Column)
        if (data.layout.part1Order) {
            const colLeft = document.querySelector('.col-left');
            data.layout.part1Order.forEach(id => {
                const el = document.getElementById(`section-${id}`);
                if (el && colLeft) colLeft.appendChild(el);
            });
        }

        // Reorder Part 2 Sections (Middle Column)
        if (data.layout.part2Order) {
            const colMid = document.querySelector('.col-mid');
            data.layout.part2Order.forEach(id => {
                const el = document.getElementById(`section-${id}`);
                if (el && colMid) colMid.appendChild(el);
            });
        }

        // Reorder Part 3 Sections (Right Side / Sidebar)
        if (data.layout.part3Order) {
            const sidebar = document.querySelector('.sidebar');
            data.layout.part3Order.forEach(id => {
                const el = document.getElementById(`side-${id}`);
                if (el && sidebar) sidebar.appendChild(el);
            });
        }
    }

    // Update Header
    document.querySelector('.main-title').innerHTML = data.header.title;
    const contactLinks = document.querySelector('.contact-card');
    contactLinks.innerHTML = data.header.links.map(link => 
        `<a href="${link.url}">${link.label}</a>`
    ).join('');

    // Update Personal Info
    document.querySelector('.personal-info .name').innerHTML = data.personal.name;
    document.querySelector('.personal-info .age').innerHTML = data.personal.age;
    document.querySelector('.personal-info .location').innerHTML = data.personal.location;

    // Update Skills
    const skillGroups = document.querySelectorAll('.skill-group');
    if (skillGroups.length >= 2) {
        const renderSkill = (skill) => {
            const row = document.createElement('div');
            row.className = 'skill-row';
            
            const labelSpan = document.createElement('span');
            labelSpan.className = 'label';
            
            // Heuristic for multiline labels
            if (skill.label.includes('<br>') || skill.label.includes('\n')) {
                row.classList.add('align-top');
                labelSpan.classList.add('multiline');
            }
            
            labelSpan.innerHTML = skill.label;
            const pctSpan = document.createElement('span');
            pctSpan.className = 'pct';
            pctSpan.innerHTML = skill.pct;
            
            row.appendChild(labelSpan);
            row.appendChild(pctSpan);
            return row;
        };

        // Left Skills
        skillGroups[0].innerHTML = '';
        data.skills_left.forEach(skill => skillGroups[0].appendChild(renderSkill(skill)));

        // Right Skills
        skillGroups[1].innerHTML = '';
        data.skills_right.forEach(skill => skillGroups[1].appendChild(renderSkill(skill)));
    }

    document.querySelector('.final-pct .pct').innerHTML = data.final_pct;

    // Update Core Skills
    const coreSkillsList = document.querySelector('.core-skills-list');
    if (coreSkillsList) {
        coreSkillsList.innerHTML = data.core_skills.map(skill => {
            let text = typeof skill === 'string' ? skill : skill.text;
            let explanation = typeof skill === 'object' ? skill.explanation : null;

            // Fallback: If it's a string like "Label: Info", extract Info as explanation
            if (!explanation && typeof skill === 'string' && skill.includes(':')) {
                const parts = skill.split(':');
                if (parts.length > 1) {
                    explanation = parts.slice(1).join(':').replace(/<\/?[^>]+(>|$)/g, "").trim();
                }
            }

            if (explanation) {
                return `<li class="has-popup" data-explanation="${explanation}">${text}</li>`;
            }
            return `<li>${text}</li>`;
        }).join('');
    }

    // Update Who I Am
    const whoIAmBlocks = document.querySelector('.col-mid .text-block');
    whoIAmBlocks.innerHTML = data.who_i_am.map(item => {
        const text = typeof item === 'string' ? item : item.text;
        const explanation = typeof item === 'object' ? item.explanation : null;
        
        if (explanation) {
            return `<p class="has-popup" data-explanation="${explanation}">${text}</p>`;
        }
        return `<p>${text}</p>`;
    }).join('');

    // Update Experience
    const experienceArea = document.querySelector('.col-mid');
    // Keep headings, replace only job entries
    const experienceHeadings = experienceArea.querySelectorAll('.section-heading');
    const whoIAmBlock = experienceArea.querySelector('.text-block');
    
    // Clear and reconstruction
    experienceArea.innerHTML = '';
    experienceArea.appendChild(experienceHeadings[0]); // Who I Am heading
    experienceArea.appendChild(whoIAmBlock); // Who I am text
    experienceArea.appendChild(experienceHeadings[1]); // Experience heading

    data.experience.forEach((job, idx) => {
        const div = document.createElement('div');
        div.className = 'job-entry' + (idx === 0 ? ' first-job' : '');
        
        const titleClass = job.explanation ? 'job-title has-popup' : 'job-title';
        const metaClass = job.explanation ? 'job-meta has-popup' : 'job-meta';
        const listClass = job.explanation ? 'bullet-list job-list has-popup' : 'bullet-list job-list';
        const explanationAttr = job.explanation ? `data-explanation="${job.explanation}"` : '';

        div.innerHTML = `
            <h3 class="${titleClass}" ${explanationAttr}>${job.title}</h3>
            <div class="${metaClass}" ${explanationAttr}>
                <span class="symbol">&#x25AB;</span> ${job.meta}
            </div>
            <ul class="${listClass}" ${explanationAttr}>
                ${job.bullets.map(b => `<li>${b}</li>`).join('')}
            </ul>
        `;
        experienceArea.appendChild(div);
    });

    // Sidebar - Education
    const eduList = document.querySelector('.edu-block .side-list');
    eduList.innerHTML = data.education.map(item => `<li>${item}</li>`).join('');

    // Sidebar - Strengths
    const strList = document.querySelector('.str-block .side-list');
    strList.innerHTML = data.strengths.map(item => `<li>${item}</li>`).join('');

    // Sidebar - Weaknesses
    const weakBlock = document.querySelector('.weak-block');
    weakBlock.innerHTML = data.weaknesses.map(item => `<p class="paragraph-item">${item}</p>`).join('');

    // Sidebar - Philosophy
    const philList = document.querySelector('.phil-block .side-list');
    philList.innerHTML = data.philosophy.map(item => `<li>${item}</li>`).join('');

    // Sidebar - Seeking
    const seekList = document.querySelector('.seek-block .side-list');
    seekList.innerHTML = data.seeking.map(item => `<li>${item}</li>`).join('');

    // Setup Popup Events
    setupPopups();

    // Recalculate layout after data injection (with rAF to ensure CSS vars are painted)
    if (window.recalculateFit) requestAnimationFrame(() => window.recalculateFit());
});

function setupPopups() {
    let popup = document.querySelector('.info-popup');
    let backdrop = document.querySelector('.popup-backdrop');

    // Create popup if it doesn't exist
    if (!popup) {
        popup = document.createElement('div');
        popup.className = 'info-popup';
        popup.innerHTML = `<span class="popup-close" title="Close">×</span><div class="popup-body"></div>`;
        document.body.appendChild(popup);
    }
    
    // Create backdrop if it doesn't exist
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'popup-backdrop';
        document.body.appendChild(backdrop);
    }

    const popupBody = popup.querySelector('.popup-body');
    const closeBtn = popup.querySelector('.popup-close');
    let isModalActive = false;

    function closePopup() {
        popup.classList.remove('visible');
        popup.classList.remove('is-modal');
        backdrop.classList.remove('visible');
        isModalActive = false;
    }

    closeBtn.onclick = (e) => {
        e.stopPropagation();
        closePopup();
    };

    backdrop.onclick = closePopup;

    const items = document.querySelectorAll('.has-popup');
    items.forEach(item => {
        item.onmouseenter = (e) => {
            if (isModalActive) return;
            const explanation = item.getAttribute('data-explanation');
            if (!explanation) return;
            
            popupBody.innerHTML = explanation.includes('<') ? explanation : `<p>${explanation}</p>`;
            popup.classList.remove('is-modal');
            popup.classList.add('visible');
        };

        item.onmousemove = (e) => {
            if (isModalActive) return;
            
            const padding = 20;
            let x = e.clientX + padding;
            let y = e.clientY + padding;

            const rect = popup.getBoundingClientRect();
            if (x + rect.width > window.innerWidth) {
                x = e.clientX - rect.width - padding;
            }
            if (y + rect.height > window.innerHeight) {
                y = e.clientY - rect.height - padding;
            }

            popup.style.left = `${x}px`;
            popup.style.top = `${y}px`;
        };

        item.onmouseleave = () => {
            if (isModalActive) return;
            popup.classList.remove('visible');
        };

        item.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent clicking the parent sections
            
            const explanation = item.getAttribute('data-explanation');
            if (!explanation) return;
            
            popupBody.innerHTML = explanation.includes('<') ? explanation : `<p>${explanation}</p>`;
            popup.classList.add('is-modal');
            popup.classList.add('visible');
            backdrop.classList.add('visible');
            isModalActive = true;
        };
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isModalActive) closePopup();
    });
}

// Download PDF logic
document.getElementById('download-btn').onclick = () => {
    const link = document.createElement('a');
    link.href = '../resume.pdf'; // Corrected path to root folder
    link.download = 'Amine_Elmoufid_Resume.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
