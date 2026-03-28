import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue } from "firebase/database";
import { firebaseConfig } from "../data/firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const bentoRef = ref(db, 'bento');

onValue(bentoRef, (snapshot) => {
    const data = snapshot.val() || {};
    document.querySelector('.bento-container')?.classList.add('loaded');
    
    // Hide loading overlay
    const loader = document.getElementById('bento-loader');
    if (loader) {
        setTimeout(() => loader.classList.add('hidden'), 300);
    }

    // Layout settings (spans and gaps) are now controlled solely via bento.css
    // to ensure pixel-perfect alignment and prevent Firebase data from breaking the grid.

    if (data.physics || data.bentoPhysics) {
        window.BENTO_PHYSICS = data.physics || data.bentoPhysics;
    }

    // Intro Card - Flip mapping
    const bTitle = document.getElementById('bento-intro-title');
    const bSub = document.getElementById('bento-intro-subtitle');
    const bBio = document.getElementById('bento-intro-about-text');
    const bStatus = document.getElementById('bento-status-text');
    const bAboutTitle = document.querySelector('.intro-card .card-back h2');
    
    if (data.intro) {
        if (bTitle) {
            let titleText = data.intro.title || "Hey, I'm Amine";
            // Initial render with empty typing span
            const animatedName = "Amine";
            const replacement = `<span class="designer-selection"><span class="typing-text"></span><span class="handle tl"></span><span class="handle br"></span></span>`;
            
            // Avoid flashing: if already has selection, don't overwrite entire innerHTML
            if (!bTitle.querySelector('.designer-selection')) {
                bTitle.innerHTML = titleText.replace(new RegExp(animatedName, 'g'), replacement);
            }

            const typingSpan = bTitle.querySelector('.typing-text');
            if (typingSpan) {
                // Typewriter Logic
                if (window.nameTypewriter) clearTimeout(window.nameTypewriter);
                
                let charIndex = 0;
                let isDeleting = false;
                
                const type = () => {
                    if (!bTitle.querySelector('.typing-text')) return; // Safety check

                    const currentText = isDeleting 
                        ? animatedName.substring(0, charIndex--) 
                        : animatedName.substring(0, charIndex++);
                    
                    typingSpan.textContent = currentText;

                    const selectionBox = bTitle.querySelector('.designer-selection');
                    if (selectionBox) {
                        if (currentText.length > 0) {
                            selectionBox.classList.add('is-active');
                        } else {
                            selectionBox.classList.remove('is-active');
                        }
                    }

                    let typeSpeed = isDeleting ? 70 : 150;

                    if (!isDeleting && charIndex > animatedName.length) {
                        isDeleting = true;
                        typeSpeed = 2500; // Pause at full name
                        charIndex = animatedName.length; // Lock at full
                    } else if (isDeleting && charIndex < 0) {
                        isDeleting = false;
                        charIndex = 0;
                        typeSpeed = 1000; // Pause at empty
                    }

                    window.nameTypewriter = setTimeout(type, typeSpeed);
                };
                type();
            }
        }
        if (bSub) bSub.innerHTML = data.intro.subtitle || "Brand Creative Strategist @amine.ink";
        if (bBio) bBio.innerHTML = data.intro.bio || "Strategist shaped by finance and an artist through my way of thinking and create. Building brand identities that resonate and endure.";
        if (bStatus) bStatus.innerHTML = data.intro.status || "Available for work";
        if (bAboutTitle) bAboutTitle.innerHTML = data.intro.about_title || "Who I Am";
    }

    // Avatar
    const avatarImg = document.getElementById('bento-avatar-img');
    const avatarTitle = document.querySelector('.avatar-card .card-back h3');
    const avatarSub = document.querySelector('.avatar-card .card-back p');
    if (avatarImg) {
        // Fallback if data is missing, empty, or just a placeholder
        const imgUrl = (data.avatar && data.avatar.image_url && data.avatar.image_url.trim() !== "") 
            ? data.avatar.image_url 
            : "https://pub-ad0cab8325564e91b51bba350c9b9425.r2.dev/resume/images/avatar.png";
        avatarImg.src = imgUrl;
        avatarImg.onerror = () => { avatarImg.src = "https://pub-ad0cab8325564e91b51bba350c9b9425.r2.dev/resume/images/avatar.png"; };
    }
    if (data.avatar) {
        if (avatarTitle) avatarTitle.innerHTML = data.avatar.title || "View Bio";
        if (avatarSub) avatarSub.innerHTML = data.avatar.subtitle || "Click to see my journey";
    }

    // Socials - Fallbacks for icons
    const fallbackSocials = [
        { name: 'LinkedIn', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>', url: 'https://www.linkedin.com/in/amine-elmoufid/' },
        { name: 'Instagram', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>', url: 'https://www.instagram.com/amine_elmoufid/' },
        { name: 'Portfolio', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>', url: 'feed.html' },
        { name: 'Folders', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>', url: '../amine.ink/' },
        { name: 'Resume', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>', url: 'profile.html' }
    ];

    // Check if we have valid social data (at least one item with an SVG)
    const hasValidSocials = Array.isArray(data.socials) && data.socials.some(s => s.svg && s.svg.trim().length > 10);
    let actualSocials = hasValidSocials ? [...data.socials] : [...fallbackSocials];
    
    // Ensure Instagram is always present with correct icon
    const igSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>';
    const igIdx = actualSocials.findIndex(s => (s.name || '').toLowerCase().includes('instagram'));
    if (igIdx >= 0) {
        // Fix broken Instagram SVG
        actualSocials[igIdx].svg = igSvg;
        actualSocials[igIdx].url = actualSocials[igIdx].url || 'https://www.instagram.com/amine_elmoufid/';
    } else {
        // Inject Instagram at position 2
        actualSocials.splice(1, 0, { name: 'Instagram', svg: igSvg, url: 'https://www.instagram.com/amine_elmoufid/' });
    }
    const container = document.getElementById('bento-socials-container');
    if (container) {
        container.innerHTML = actualSocials.map((social, idx) => {
            let icon = social.svg || "";
            if (icon.includes('<svg')) {
                icon = icon.replace('<svg', '<svg class="social-icon"');
            }
            // Display name on the back
            const label = social.name ? social.name.replace(/_/g, ' ') : ('Link ' + (idx + 1));
            return `
            <div class="card social-card flip-card" data-ve-id="social-card" data-idx="${idx}">
                <div class="card-inner">
                    <div class="card-front">${icon}</div>
                    <div class="card-back"><span>${label}</span></div>
                </div>
            </div>`;
        }).join('');

        // Pre-process social URLs based on name/keywords for better fallbacks
        actualSocials.forEach(s => {
            const n = (s.name || "").toLowerCase().trim();
            const u = (s.url || "").toLowerCase();
            
            if (n.includes('linkedin') || u.includes('linkedin.com')) s.url = 'https://www.linkedin.com/in/amine-elmoufid/';
            if (n.includes('instagram') || u.includes('instagram.com')) s.url = 'https://www.instagram.com/amine_elmoufid/';
            if (n.includes('portfolio') || n.includes('porfolio') || u.includes('feed.html')) {
                s.url = 'feed.html';
            }
            if (n.includes('folders') || n.includes('folder') || n.includes('amine.ink') || u.includes('amine.ink')) {
                s.url = '../amine.ink/';
            }
            if (n.includes('resume') || u.includes('profile.html') || u.includes('index.html')) {
                s.url = 'profile.html';
            }
        });

        container.querySelectorAll('.social-card').forEach(card => {
            card.onclick = () => {
                const idx = card.getAttribute('data-idx');
                const social = actualSocials[idx];
                const url = social.url || "#";
                
                const label = social.name ? social.name.replace(/_/g, ' ') : ('Link ' + (idx + 1));
                
                // NO POPUP for specific links (case-insensitive and more flexible check)
                const noPopuplinksKeywords = ['portfolio', 'folders', 'resume', 'amine.ink', 'feed.html', 'index.html'];
                const lowerCaseLabel = label.toLowerCase();
                const lowerCaseUrl = url.toLowerCase();

                const shouldDirectNavigate = noPopuplinksKeywords.some(keyword => 
                    lowerCaseLabel.includes(keyword) || lowerCaseUrl.includes(keyword)
                );

                if (shouldDirectNavigate) {
                    // Try to switch tab in parent browser simulation if present
                    if (window.parent && typeof window.parent.switchBrowserTab === 'function') {
                        let prefix = '';
                        if (lowerCaseUrl.includes('feed.html')) prefix = 'feed';
                        if (lowerCaseUrl.includes('amine.ink') || lowerCaseUrl.includes('home')) prefix = 'home';
                        if (lowerCaseUrl.includes('index.html')) prefix = 'resume';
                        if (lowerCaseUrl.includes('skills.html')) prefix = 'skills';
                        
                        if (prefix && window.parent.switchBrowserTab(prefix)) {
                            return; // Success, tab switched
                        }
                    }
                    window.location.href = url;
                    return;
                }

                const popupHtml = `
                    <h2 style="margin-bottom:8px;">Visit ${label}?</h2>
                    <p style="color:var(--text-secondary);">Would you like to open my <strong>${label}</strong> profile in a new tab?</p>
                    <div style="display:flex; flex-direction:column; gap:12px; margin-top:24px;">
                        <button class="cta-btn" style="width:100%; justify-content:center; background:white; color:black;" onclick="window.open('${url}', '_blank'); window.closeBentoModal();">
                            Open ${label}
                        </button>
                        <a href="javascript:void(0)" style="font-size:13px; color:var(--text-secondary); text-decoration:underline; text-align:center; margin-top:8px;" onclick="window.copyToClipboard('${url}'); window.closeBentoModal();">
                            Just copy the link instead
                        </a>
                        <button class="cta-btn" style="width:100%; justify-content:center; background:none; border:none; color:var(--text-secondary); font-size:13px; margin-top:8px;" onclick="window.closeBentoModal();">
                           Cancel
                        </button>
                    </div>
                `;
                window.openBentoModal(popupHtml);
            };
        });
    }

    // Works - Click for Popup
    const bWorksTitle = document.getElementById('bento-works-title');
    if (bWorksTitle) bWorksTitle.innerHTML = data.works?.title || "Key Projects";
    
    const workItems = (data.works && data.works.items) ? data.works.items : [];
    const fallbackLogos = [
        'https://pub-ad0cab8325564e91b51bba350c9b9425.r2.dev/resume/images/logos/startzone.svg',
        'https://pub-ad0cab8325564e91b51bba350c9b9425.r2.dev/resume/images/logos/minhoo.png',
        'https://pub-ad0cab8325564e91b51bba350c9b9425.r2.dev/resume/images/logos/Movenpick.png'
    ];
    const fallbackNames = ['StartZone', 'Minhoo', 'Mövenpick'];

    for (let i = 1; i <= 3; i++) {
        const linkEl = document.getElementById(`work-link-${i}`);
        const imgEl = document.getElementById(`work-img-${i}`);
        const item = workItems[i-1];
        const logo = fallbackLogos[i - 1];
        const projectName = item?.title || fallbackNames[i - 1];
        
        if (linkEl) {
            linkEl.onclick = (e) => {
                e.preventDefault();
                let content = item?.popup_content || '';
                
                // Strip any broken <img> tags from Firebase content
                content = content.replace(/<img[^>]*>/gi, '');
                
                // Build popup with local logo header + Firebase text content
                const logoHeader = `
                    <div style="text-align:center; margin-bottom:32px; background:rgba(255,255,255,0.03); border-radius:16px; width:100%; aspect-ratio: 16 / 9; display:flex; align-items:center; justify-content:center; overflow:hidden; border: 1px solid rgba(255,255,255,0.05);">
                        <img src="${logo}" alt="${projectName}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'">
                    </div>
                `;
                
                if (!content.trim()) {
                    content = `<h2>${projectName}</h2><p>Experience the full case study by visiting our main platform.</p>`;
                }
                
                window.openBentoModal(logoHeader + content);
            };
        }
        if (imgEl) {
            const imgUrl = item?.image_url?.trim();
            if (imgUrl) {
                const testImg = new Image();
                testImg.onload = () => {
                    imgEl.style.backgroundImage = `url('${imgUrl}')`;
                    imgEl.style.backgroundSize = 'cover';
                };
                testImg.onerror = () => {
                    imgEl.style.backgroundImage = `url('${logo}')`;
                    imgEl.style.backgroundSize = 'contain';
                    imgEl.style.backgroundPosition = 'center';
                    imgEl.style.backgroundRepeat = 'no-repeat';
                };
                testImg.src = imgUrl;
            } else {
                imgEl.style.backgroundImage = `url('${logo}')`;
                imgEl.style.backgroundSize = 'contain';
                imgEl.style.backgroundPosition = 'center';
                imgEl.style.backgroundRepeat = 'no-repeat';
            }
        }
    }

    // Tools - Click for Popup
    const toolsArea = document.getElementById('tools-physics');
    const toolsTitle = document.querySelector('.tools-card .card-header h3');
    if (data.tools_config && toolsTitle) {
        toolsTitle.innerHTML = data.tools_config.title || "Tools I use";
    }

    // Tools - hardcoded local logos (no Firebase for images)
    const toolItems = [
        { url: 'https://pub-ad0cab8325564e91b51bba350c9b9425.r2.dev/resume/images/logos/premiere-pro.png', name: 'Premiere Pro', desc: 'Professional video editing software.', popup_content: '<h2>Premiere Pro</h2><p>My main tool for video editing. I use it to structure content, manage pacing, and ensure a clear and coherent narrative across projects.</p>' },
        { url: 'https://pub-ad0cab8325564e91b51bba350c9b9425.r2.dev/resume/images/logos/DaVinci Resolve.png', name: 'DaVinci Resolve', desc: 'Advanced color grading and video editing.', popup_content: '<h2>DaVinci Resolve</h2><p>Used for color grading and final visual adjustments. I focus on achieving consistent tones and a clean, natural look that supports the overall story.</p>' },
        { url: 'https://pub-ad0cab8325564e91b51bba350c9b9425.r2.dev/resume/images/logos/CapCut.png', name: 'CapCut', desc: 'Intuitive video editing for social content.', popup_content: '<h2>CapCut</h2><p>A practical tool for fast content production. I use it to quickly create and adapt short-form content when speed and efficiency are essential.</p>' },
        { url: 'https://pub-ad0cab8325564e91b51bba350c9b9425.r2.dev/resume/images/logos/illustrator.png', name: 'Illustrator', desc: 'Vector illustration and graphic design.', popup_content: '<h2>Illustrator</h2><p>Used to develop visual identities and vector-based assets. I focus on building clear, scalable design systems.</p>' },
        { url: 'https://pub-ad0cab8325564e91b51bba350c9b9425.r2.dev/resume/images/logos/photoshop.png', name: 'Photoshop', desc: 'Industry-leading image editing and design.', popup_content: '<h2>Photoshop</h2><p>Used for image editing and composition. It allows me to refine visuals, combine elements, and adjust details when more control is required.</p>' },
        { url: 'https://pub-ad0cab8325564e91b51bba350c9b9425.r2.dev/resume/images/logos/lightroom.png', name: 'Lightroom', desc: 'Professional photo editing and management.', popup_content: '<h2>Lightroom</h2><p>Used for photo editing and color correction. I focus on maintaining a natural and consistent visual quality across images.</p>' },
        { url: 'https://pub-ad0cab8325564e91b51bba350c9b9425.r2.dev/resume/images/logos/Canva.png', name: 'Canva', desc: 'Popular online graphic design platform.', popup_content: '<h2>Canva</h2><p>Used for quick and efficient design production. It helps me deliver clean visuals across different formats, especially for communication and social content.</p>' },
        { url: 'https://pub-ad0cab8325564e91b51bba350c9b9425.r2.dev/resume/images/logos/Affinity.png', name: 'Affinity (Suite)', desc: 'Professional creative design suite.', popup_content: '<h2>Affinity (Suite)</h2><p>An alternative design tool I use for focused workflows. It offers reliable performance and precision for lightweight design tasks.</p>' },
        { url: 'https://pub-ad0cab8325564e91b51bba350c9b9425.r2.dev/resume/images/logos/AI.png', name: 'AI Creative Workflows', desc: 'AI-powered creative process.', popup_content: '<h2>AI Creative Workflows</h2><p>I use AI to support ideation, accelerate iteration, and streamline parts of the creative process. It helps improve efficiency while maintaining creative direction.</p>' },
        { url: 'https://pub-ad0cab8325564e91b51bba350c9b9425.r2.dev/resume/images/logos/Antigravity.png', name: 'Antigravity (Vibe Coding)', desc: 'Rapid prototyping and tool building.', popup_content: '<h2>Antigravity (Vibe Coding)</h2><p>Used to build small tools and prototype digital projects quickly. I rely on it to turn ideas into functional outputs, test concepts in real conditions, and develop lightweight solutions without complex setup.</p>' },
    ];

    if (toolsArea) {
        toolsArea.innerHTML = toolItems.map((tool, idx) => {
            const cls = "physics-item tool-icon";
            return `
            <div class="${cls}" data-idx="${idx}" data-title="${tool.name}" data-description="${tool.desc}">
                <img src="${tool.url}" alt="${tool.name}" referrerpolicy="no-referrer" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="tool-fallback" style="display:none; width:100%; height:100%; align-items:center; justify-content:center; font-weight:700; font-size:16px; color:white; background:#333; border-radius:18px;">${tool.name.substring(0, 2)}</div>
            </div>`;
        }).join('');

        toolsArea.querySelectorAll('.tool-icon').forEach(icon => {
            icon.onclick = () => {
                const idx = icon.getAttribute('data-idx');
                const tool = toolItems[idx];
                const popupHeader = `
                    <div style="display:flex; align-items:center; gap:16px; margin-bottom:20px;">
                        <img src="${tool.url}" alt="${tool.name}" style="width:40px; height:40px; object-fit:contain; border-radius:10px;" onerror="this.style.display='none'">
                        <h2 style="margin:0; font-size:22px;">${tool.name}</h2>
                    </div>
                `;
                const bodyText = tool.popup_content
                    ? tool.popup_content.replace(/<h2>[^<]*<\/h2>/i, '')
                    : `<p>${tool.desc || 'I use this tool extensively in my professional workflow.'}</p>`;
                window.openBentoModal(popupHeader + bodyText);
            };
        });
    }

    // Services (Physics) - Click for Popup
    const srvData = (data.services && Array.isArray(data.services)) ? data.services : [];
    const servicesTitle = document.querySelector('.services-card .card-header h3');
    if (data.services_config && servicesTitle) {
        servicesTitle.innerHTML = data.services_config.title || "Services";
    }
    const defaultServices = ['Webflow', 'SEO', 'Framer', 'UX/UI Design', 'Branding', '3D Design', 'Social Media'];
    const serviceItems = srvData.length > 0 ? srvData : defaultServices.map(s => ({ name: s, popup_content: "" }));
    
    const serviceArea = document.getElementById('services-physics');
    if (serviceArea) {
        serviceArea.innerHTML = serviceItems.map((srv, idx) => {
            const name = typeof srv === 'string' ? srv : srv.name;
            return `<div class="physics-item pill" data-idx="${idx}">${name}</div>`;
        }).join('');

        serviceArea.querySelectorAll('.pill').forEach(pill => {
            pill.onclick = () => {
                const idx = pill.getAttribute('data-idx');
                const srv = serviceItems[idx];
                const content = srv.popup_content || `<h2>${srv.name || srv}</h2><p>I provide comprehensive solutions in ${srv.name || srv}.</p>`;
                window.openBentoModal(content);
            };
        });
    }

    // Collab
    const clbTitle = document.getElementById('bento-collab-title');
    const clbText = document.getElementById('bento-collab-text');
    const clbBtn = document.getElementById('bento-collab-btntext');
    if (data.collab) {
        if (clbTitle) clbTitle.innerHTML = data.collab.title || "Let's collab!";
        if (clbText) clbText.innerHTML = data.collab.text || "Let's turn your idea into reality!";
        if (clbBtn) clbBtn.innerHTML = data.collab.btn_text || 'Send a message now!';
        
        const collabButton = document.querySelector('.collab-action');
        if (collabButton) {
            collabButton.onclick = (e) => {
                e.preventDefault();
                
                const showConfirmPopup = (title, url) => {
                    const escapedUrl = url.replace(/'/g, "\\'");
                    const popupHtml = `
                        <h2>${title}</h2>
                        <p style="color:var(--text-secondary);">How would you like to proceed?</p>
                        <div style="display:flex; flex-direction:column; gap:12px; margin-top:24px;">
                            <button class="cta-btn" style="width:100%; justify-content:center; background:white; color:black;" onclick="window.open('${url}', '_blank'); window.closeBentoModal();">
                                Open ${title}
                            </button>
                            <a href="javascript:void(0)" style="font-size:13px; color:var(--text-secondary); text-decoration:underline; text-align:center; margin-top:8px;" onclick="window.copyToClipboard('${escapedUrl}'); window.closeBentoModal();">
                                Just copy the info instead
                            </a>
                            <button class="cta-btn" style="width:100%; justify-content:center; background:none; border:none; color:var(--text-secondary); font-size:13px; margin-top:16px;" onclick="window.openContactPopup()">
                                ← Back to options
                            </button>
                        </div>
                    `;
                    window.openBentoModal(popupHtml);
                };

                window.openContactPopup = () => {
                    // Show all options even if empty for visibility; they'll use placeholders if needed
                    const contacts = [
                        { label: 'Email', value: data.collab.url || 'mailto:hello@example.com', icon: '✉️' },
                        { label: 'Instagram DM', value: data.collab.ig_url || '#', icon: '📸' },
                        { label: 'LinkedIn', value: data.collab.li_url || '#', icon: '🔗' },
                        { label: 'WhatsApp', value: data.collab.wa_num ? `https://wa.me/${data.collab.wa_num.replace(/\D/g,'')}` : '#', icon: '💬' },
                        { label: 'Phone', value: data.collab.ph_num ? `tel:${data.collab.ph_num}` : '#', icon: '📞' }
                    ];

                    const popupHtml = `
                        <h2 style="margin-bottom:8px; color:white;">Get in Touch</h2>
                        <p style="color:var(--text-secondary); margin-bottom:24px;">Choose your preferred way to reach out:</p>
                        <div style="display:grid; grid-template-columns: 1fr; gap:10px;">
                            ${contacts.map(c => `
                                <button class="cta-btn contact-option-btn" 
                                    style="width:100%; justify-content:flex-start; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); padding: 14px 20px; transition: background 0.2s;" 
                                    onmouseover="this.style.background='rgba(255,255,255,0.1)'"
                                    onmouseout="this.style.background='rgba(255,255,255,0.05)'"
                                    onclick="window.openConfirmStep('${c.label}', '${c.value}')">
                                    <span style="margin-right:12px; font-size:18px;">${c.icon}</span>
                                    <span style="color:white; font-weight:500;">${c.label}</span>
                                </button>
                            `).join('')}
                        </div>
                    `;
                    window.openBentoModal(popupHtml);
                };

                window.openConfirmStep = (label, url) => {
                    showConfirmPopup(label, url);
                };

                window.openContactPopup();
            };
        }
    }

    if (window.initPhysics) {
        requestAnimationFrame(() => {
            window.destroyPhysics();
            window.initPhysics();
        });
    }

    // --- Popups Logic ---
    const modal = document.getElementById('bento-modal');
    const modalBody = document.getElementById('modal-body');
    const closeBtn = document.getElementById('modal-close-btn');
    const backdrop = document.getElementById('modal-backdrop');

    window.openBentoModal = function(htmlContent) {
        if (!modal) return;
        modalBody.innerHTML = htmlContent;
        modal.classList.add('active');
    };
    window.closeBentoModal = function() {
        if (!modal) return;
        modal.classList.remove('active');
    };

    if (closeBtn) closeBtn.onclick = window.closeBentoModal;
    if (backdrop) backdrop.onclick = window.closeBentoModal;

    // Avatar Flip -> Open Modal
    const avatarCard = document.getElementById('bento-avatar-card');
    if (avatarCard) {
        avatarCard.onclick = () => {
            const bioContent = data.avatar?.bio || `<h2>About Me</h2><p>Welcome to my studio world.</p>`;
            const statusText = data.intro?.status || "Available for work";
            const copyStr = data.collab?.copy_text || "hello@example.com";
            
            const popupHtml = `
                <div class="modal-bio-wrapper">
                    ${bioContent}
                    <div style="margin-top:32px; padding-top:20px; border-top:1px solid rgba(255,255,255,0.08);">
                        <button class="status-btn" onclick="window.copyStatusInfo()">
                            <span class="status-dot"></span>
                            <span>${statusText}</span>
                        </button>
                    </div>
                </div>
            `;
            window.openBentoModal(popupHtml);
        };
    }

    // Toast Logic
    const toast = document.getElementById('bento-toast');
    const toastMsg = document.getElementById('toast-message');
    window.showBentoToast = function(msg) {
        if (!toast || !toastMsg) return;
        toastMsg.innerText = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    };

    // Unified Copy Function
    window.copyToClipboard = function(url) {
        if (!url || url === "#") return;
        
        let cleanUrl = url;
        if (url.startsWith('mailto:')) cleanUrl = url.replace('mailto:', '');
        if (url.startsWith('tel:')) cleanUrl = url.replace('tel:', '');
        
        // Handle clipboard copy with fallback
        const textArea = document.createElement("textarea");
        textArea.value = cleanUrl;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        let success = false;
        try {
            success = document.execCommand('copy');
        } catch (err) {
            console.error('Fallback copy failing', err);
        }
        
        document.body.removeChild(textArea);
        
        if (success) {
            window.showBentoToast('Copied to clipboard!');
        } else if (navigator.clipboard) {
            // Try async if fallback failed
            navigator.clipboard.writeText(cleanUrl).then(() => {
                window.showBentoToast('Copied to clipboard!');
            });
        }
    };

    window.copyStatusInfo = function() {
        let copyStr = data.collab?.copy_text || "hello@example.com";
        window.copyToClipboard(copyStr);
    };

    // Status Button -> Clipboard Copy
    const statusBtn = document.getElementById('bento-status-btn');
    if (statusBtn) {
        statusBtn.onclick = (e) => {
            e.stopPropagation();
            window.copyStatusInfo();
        };
    }
});
