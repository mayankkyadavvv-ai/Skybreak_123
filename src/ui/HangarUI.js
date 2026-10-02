import { comparisonSummary } from './LoadoutComparison.js';
import { trapFocus, escapeHTML } from "./Accessibility.js";
import { JET_MODELS, LIVERIES, MODIFICATIONS, computeJetStats } from "../game/JetConfigs.js";
import { progression, RANKS } from "../game/Progression.js";

export class HangarUI {
  constructor(root, game, onClose) {
    this.root = root;
    this.game = game;
    this.game.beginHangarPreview?.();
    this.onClose = onClose;
    this.activeTab = "fleet"; // fleet | liveries | performance | weapons
    this.config = { ...game.jetConfig, modifications: { ...game.jetConfig.modifications } };
    this.isDragging = false;
    this.lastPointerX = 0;
    this.autoRotate = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    this.collapsed=false;
    this.showDossier = false;

    this.container = document.createElement("div");
    this.container.id = "hangar-modal";
    this.container.className = "hangar-overlay";
    this.container.setAttribute("role","dialog");this.container.setAttribute("aria-label","Aircraft hangar");this.container.setAttribute("aria-modal","true");
    this.returnFocus=document.activeElement;
    this.root.appendChild(this.container);

    this.onKey=event=>{if(event.code==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(this.showDossier){this.showDossier=false;this.render();}else this.close();}else trapFocus(event,this.showDossier?this.container.querySelector('.dossier-modal'):this.container);};
    window.addEventListener('keydown',this.onKey,true);
    this.bindPointerOrbit();
    this.render();
  }

  bindPointerOrbit() {
    this.container.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".hangar-sidebar") || e.target.closest("button") || e.target.closest("input") || e.target.closest(".dossier-modal")) return;
      this.isDragging = true;
      this.container.setPointerCapture?.(e.pointerId);
      this.lastPointerX = e.clientX;
      this.autoRotate = false;
    });

    this.container.addEventListener("pointermove", (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastPointerX;
      this.lastPointerX = e.clientX;
      if (this.game) {
        this.game.hangarAngle = (this.game.hangarAngle || 0) - dx * 0.008;
      }
    });

    for(const type of ["pointerup","pointercancel","lostpointercapture"])this.container.addEventListener(type,()=>{this.isDragging=false;});

    this.container.addEventListener("wheel", (e) => {
      if (e.target.closest(".hangar-tab-content")) return;
      e.preventDefault();
      if (this.game) {
        this.game.hangarDistance = Math.min(36, Math.max(11, (this.game.hangarDistance || 17.5) + Math.sign(e.deltaY) * 1.5));
      }
    }, { passive: false });
  }

  selectModel(modelId) {
    if (!progression.isUnlocked("jet", modelId)) {
      const reqRank = RANKS.find(r => r.unlockId === modelId);
      this.game.ui.message(`🔒 LOCKED: Requires ${reqRank ? reqRank.name : "Higher Rank"} (${reqRank ? reqRank.minXP : 0} XP)`, 3);
      return;
    }
    if(!JET_MODELS[modelId])return;
    this.config.modelId = modelId;
    this.game.equipJet(this.config);
    this.render();
  }

  selectLivery(liveryId) {
    if (!progression.isUnlocked("livery", liveryId)) {
      const reqRank = RANKS.find(r => r.unlockId === liveryId);
      this.game.ui.message(`🔒 LOCKED: Requires ${reqRank ? reqRank.name : "Higher Rank"} (${reqRank ? reqRank.minXP : 0} XP)`, 3);
      return;
    }
    if(!LIVERIES[liveryId])return;
    this.config.liveryId = liveryId;
    this.game.equipJet(this.config);
    this.render();
  }

  selectMod(category, modId) {
    if (!progression.isUnlocked("mod", modId)) {
      const reqRank = RANKS.find(r => r.unlockId === modId);
      this.game.ui.message(`🔒 LOCKED: Requires ${reqRank ? reqRank.name : "Higher Rank"} (${reqRank ? reqRank.minXP : 0} XP)`, 3);
      return;
    }
    if(!MODIFICATIONS[category]?.options?.[modId])return;
    this.config.modifications[category] = modId;
    this.game.equipJet(this.config);
    this.render();
  }

  render() {
    const stats = computeJetStats(this.config.modelId, this.config.modifications);
    const activeModel = JET_MODELS[this.config.modelId] || JET_MODELS.x17;
    const activeLivery = LIVERIES[this.config.liveryId] || LIVERIES.grey;
    const rank = progression.getCurrentRank();
    const rankProg = progression.getRankProgress();

    const focusKey=document.activeElement?.dataset;
    this.container.classList.toggle("inspection-mode",this.collapsed);
    this.container.innerHTML = `
      <div class="hangar-hud-header">
        <div class="hangar-title-group">
          <span class="hangar-tag">SKYBREAK AEROSPACE LAB</span>
          <h2>HANGAR & CUSTOMIZATION STUDIO</h2>
        </div>

        <!-- Pilot Dossier Badge in Header -->
        <div class="pilot-status-header" id="btn-open-pilot-dossier" title="Click to view Pilot Dossier & Career Stats">
          <div class="pilot-rank-badge">
            <span class="pilot-insignia">${rank.insignia}</span>
            <div class="pilot-info-col">
              <span class="pilot-rank-name">${rank.name.toUpperCase()}</span>
              <strong class="pilot-callsign-tag">"${escapeHTML(progression.profile.callsign)}"</strong>
            </div>
          </div>
          <div class="pilot-xp-track">
            <div class="pilot-xp-fill" style="width: ${rankProg.percent}%"></div>
          </div>
          <span class="pilot-xp-label">${progression.profile.xp} / ${rankProg.target} XP</span>
        </div>

        <div class="hangar-actions"><button id="hangar-panels" aria-expanded="${!this.collapsed}">${this.collapsed?"Show panels":"Inspect aircraft"}</button>
          <button class="hangar-orbit-btn ${this.autoRotate ? "active" : ""}" id="hangar-toggle-orbit">
            ${this.autoRotate ? "⟳ TURNTABLE: ON" : "⏸ TURNTABLE: OFF"}
          </button>
          <button class="hangar-close-btn" id="hangar-close-top">✕ CLOSE</button>
        </div>
      </div>

      <!-- Left Sidebar: Inspection & Stats -->
      <div class="hangar-sidebar hangar-left">
        <div class="hangar-panel-header">
          <span class="badge-code">${activeModel.code}</span>
          <h3>${activeModel.name}</h3>
          <span class="role-desc">${activeModel.role}</span>
        </div>

        <p class="hangar-flavor-text">${activeModel.description}</p>

        <div class="hangar-stats-box">
          <h4>AIRCRAFT SPECIFICATIONS</h4>
          
          <div class="stat-row">
            <div class="stat-labels">
              <span>MAX AIRSPEED</span>
              <strong>${stats.maxSpeedKmh.toLocaleString()} KM/H (${(stats.speedMult * 100).toFixed(0)}%)</strong>
            </div>
            <div class="stat-track">
              <div class="stat-fill speed-fill" style="width: ${Math.min(100, (stats.maxSpeedKmh / 2800) * 100)}%"></div>
            </div>
          </div>

          <div class="stat-row">
            <div class="stat-labels">
              <span>MANEUVER AGILITY</span>
              <strong>${stats.agility} PTS (${(stats.turnMult * 100).toFixed(0)}%)</strong>
            </div>
            <div class="stat-track">
              <div class="stat-fill agility-fill" style="width: ${Math.min(100, stats.agility)}%"></div>
            </div>
          </div>

          <div class="stat-row">
            <div class="stat-labels">
              <span>ARMOR / DURABILITY</span>
              <strong>${stats.maxHp} HP</strong>
            </div>
            <div class="stat-track">
              <div class="stat-fill armor-fill" style="width: ${Math.min(100, (stats.maxHp / 200) * 100)}%"></div>
            </div>
          </div>

          <div class="stat-row">
            <div class="stat-labels">
              <span>AFTERBURNER BOOST</span>
              <strong>+${((stats.boostMult - 1) * 100).toFixed(0)}% THRUST</strong>
            </div>
            <div class="stat-track">
              <div class="stat-fill boost-fill" style="width: ${Math.min(100, ((stats.boostMult - 0.9) / 0.5) * 100)}%"></div>
            </div>
          </div>
        </div>

        <div class="hangar-hardpoints-box">
          <h4>COMBAT LOADOUT</h4>
          <div class="hardpoint-tags">
            <span class="hp-badge">🚀 ${stats.missiles} × IR Heat-Seeking Missiles</span>
            <span class="hp-badge">⚡ ${stats.cannon} Rds 20mm Tracer Cannon</span>
            <span class="hp-badge">✨ ${stats.flares} Defensive Thermal Flares</span>
            <span class="hp-badge">🎨 ${activeLivery.name}</span>
          </div>
        </div>
      </div>

      <!-- Right Sidebar: Customization Tabs -->
      <div class="hangar-sidebar hangar-right">
        <div class="hangar-tabs-nav">
          <button class="hangar-tab-btn ${this.activeTab === "fleet" ? "active" : ""}" data-tab="fleet">FLEET</button>
          <button class="hangar-tab-btn ${this.activeTab === "liveries" ? "active" : ""}" data-tab="liveries">LIVERIES</button>
          <button class="hangar-tab-btn ${this.activeTab === "performance" ? "active" : ""}" data-tab="performance">TUNING</button>
          <button class="hangar-tab-btn ${this.activeTab === "weapons" ? "active" : ""}" data-tab="weapons">WEAPONS</button>
        </div>

        <div class="hangar-tab-content">
          ${this.renderTabContent()}
        </div>

        <div class="hangar-footer-actions">
          <button class="hangar-btn-secondary" id="btn-open-dossier-footer">🎖️ PILOT DOSSIER</button>
          <button class="hangar-btn-primary" id="hangar-equip-launch">CONFIRM & FLY ✈️</button>
        </div>
      </div>

      ${this.showDossier ? this.renderDossierModal() : ""}
    `;

    this.container.querySelectorAll('.jet-card,.livery-card,.mod-card,#btn-open-pilot-dossier').forEach(card=>{
      card.setAttribute('role','button');card.tabIndex=0;card.setAttribute('aria-pressed',String(card.classList.contains('selected')));
      card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();card.click();}});
    });
    this.bindTabEvents();
    this.container.querySelector('#hangar-panels')?.addEventListener('click',()=>{this.collapsed=!this.collapsed;this.render();this.container.querySelector('#hangar-panels')?.focus();});
    const selector=focusKey?.modId ? `[data-mod-id="${focusKey.modId}"]` : focusKey?.tab ? `[data-tab="${focusKey.tab}"]` : focusKey?.model ? `[data-model="${focusKey.model}"]` : focusKey?.livery ? `[data-livery="${focusKey.livery}"]` : '#hangar-close-top';
    this.container.querySelector(this.showDossier?'#btn-close-dossier':selector)?.focus();
  }

  renderDossierModal() {
    const p = progression.profile;
    const rank = progression.getCurrentRank();
    const rankProg = progression.getRankProgress();

    return `
      <div class="dossier-overlay">
        <div class="dossier-modal">
          <div class="dossier-header">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:24px;">🎖️</span>
              <div>
                <span class="eyebrow" style="color:#00e5ff;">INDIAN AIR FORCE PILOT DOSSIER</span>
                <h3 style="margin:0;font-size:18px;color:#fff;">SERVICE RECORD &amp; CAREER</h3>
              </div>
            </div>
            <button class="close-btn" id="btn-close-dossier">×</button>
          </div>

          <div class="dossier-body">
            <div class="dossier-rank-card">
              <div class="dossier-insignia">${rank.insignia}</div>
              <div class="dossier-rank-info">
                <h2>${rank.name.toUpperCase()}</h2>
                <span class="dossier-rank-code">RANK CODE: ${rank.code} · LEVEL ${rank.level} OF 8</span>
                <div class="dossier-xp-bar-container">
                  <div class="dossier-xp-bar-fill" style="width: ${rankProg.percent}%"></div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:11px;color:#85c4b8;margin-top:4px;">
                  <span>CURRENT: ${p.xp} XP</span>
                  <span>NEXT RANK: ${rankProg.target} XP</span>
                </div>
              </div>
            </div>

            <div class="dossier-callsign-editor">
              <label>PILOT CALLSIGN:</label>
              <div style="display:flex;gap:8px;">
                <input type="text" id="input-dossier-callsign" value="${escapeHTML(p.callsign)}" maxlength="16" />
                <button class="primary" id="btn-save-callsign" style="padding:6px 14px;font-size:12px;">UPDATE</button>
              </div>
            </div>

            <div class="dossier-stats-grid">
              <div class="dossier-stat-box">
                <span class="stat-num">${p.kills}</span>
                <span class="stat-desc">TOTAL COMBAT KILLS</span>
              </div>
              <div class="dossier-stat-box">
                <span class="stat-num">${p.missileKills}</span>
                <span class="stat-desc">MISSILE STRIKES</span>
              </div>
              <div class="dossier-stat-box">
                <span class="stat-num">${p.cannonKills}</span>
                <span class="stat-desc">CANNON KILLS</span>
              </div>
              <div class="dossier-stat-box">
                <span class="stat-num">${p.landings}</span>
                <span class="stat-desc">RUNWAY TOUCHDOWNS</span>
              </div>
              <div class="dossier-stat-box">
                <span class="stat-num">${Math.round(p.distanceFlownKm)} KM</span>
                <span class="stat-desc">SORTIE DISTANCE</span>
              </div>
              <div class="dossier-stat-box">
                <span class="stat-num">${p.missionsWon}</span>
                <span class="stat-desc">MISSIONS WON</span>
              </div>
            </div>

            <div class="dossier-ranks-list">
              <h4 style="margin:12px 0 8px;font-size:12px;color:#ffd700;">IAF COMMISSION RANKS &amp; UNLOCKS</h4>
              <div style="max-height:160px;overflow-y:auto;padding-right:6px;">
                ${RANKS.map(r => {
                  const isAchieved = p.xp >= r.minXP;
                  const isCurrent = rank.level === r.level;
                  return `
                    <div class="rank-list-row ${isCurrent ? "current" : isAchieved ? "unlocked" : "locked"}">
                      <span class="row-insignia">${r.insignia}</span>
                      <div class="row-name">
                        <strong>${r.name}</strong> (${r.code})
                        <small style="display:block;color:#85c4b8;">${r.unlockName}</small>
                      </div>
                      <span class="row-xp">${r.minXP} XP ${isCurrent ? "· ACTIVE" : isAchieved ? "✓" : "🔒"}</span>
                    </div>
                  `;
                }).join("")}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderTabContent() {
    if (this.activeTab === "fleet") {
      return `
        <div class="fleet-list">
          ${Object.values(JET_MODELS).map((m) => {
            const isSelected = this.config.modelId === m.id;
            const isUnlocked = progression.isUnlocked("jet", m.id);
            const reqRank = RANKS.find(r => r.unlockId === m.id);
            const candidate=computeJetStats(m.id,this.config.modifications);
            const comparison=comparisonSummary(this.config,{...this.config,modelId:m.id});
            return `
              <div class="jet-card ${isSelected ? "selected" : ""} ${!isUnlocked ? "locked-card" : ""}" data-model="${m.id}">
                <div class="jet-card-header">
                  <span class="jet-card-code">${m.code}</span>
                  <span class="jet-card-badge">${m.country}</span>
                </div>
                <h4 class="jet-card-title">${m.name}</h4>
                <div class="jet-card-role">${m.role}</div>
                <div class="jet-card-stats-mini">
                  <span>⚡ ${candidate.maxSpeedKmh} km/h</span>
                  <span>🔄 Agility ${candidate.agility}</span>
                  <span>🛡️ ${candidate.maxHp} HP</span>
                </div>
                <p class="stat-delta">${comparison}</p>
                <div class="jet-card-footer">
                  ${!isUnlocked ? `<span class="lock-tag">🔒 UNLOCKS AT ${reqRank ? reqRank.name.toUpperCase() : "HIGHER RANK"} (${reqRank ? reqRank.minXP : 0} XP)</span>` : isSelected ? "<span class='equipped-badge'>✓ EQUIPPED</span>" : "<button class='select-btn'>SELECT AIRCRAFT</button>"}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      `;
    }

    if (this.activeTab === "liveries") {
      return `
        <p class="cosmetic-note">Liveries are cosmetic. They never change hitboxes, handling or weapon strength.</p><div class="liveries-list">
          ${Object.values(LIVERIES).map((l) => {
            const isSelected = this.config.liveryId === l.id;
            const isUnlocked = progression.isUnlocked("livery", l.id);
            const reqRank = RANKS.find(r => r.unlockId === l.id);
            return `
              <div class="livery-card ${isSelected ? "selected" : ""} ${!isUnlocked ? "locked-card" : ""}" data-livery="${l.id}">
                <div class="livery-swatch-circle" style="background: ${l.swatch}; border: 3px solid ${l.stripeColor ? "#" + l.stripeColor.toString(16).padStart(6, "0") : "#fff"}"></div>
                <div class="livery-info">
                  <span class="livery-tag">${l.tag}</span>
                  <h4 class="livery-title">${l.name}</h4>
                  ${!isUnlocked ? `<small style="color:#ffaa44;font-size:10px;">🔒 ${reqRank ? reqRank.name : "Rank Locked"}</small>` : ""}
                </div>
                ${!isUnlocked ? "<span class='lock-icon-mini'>🔒</span>" : isSelected ? "<span class='equipped-badge'>✓ ACTIVE</span>" : "<button class='select-btn'>APPLY</button>"}
              </div>
            `;
          }).join("")}
        </div>
      `;
    }

    if(['performance','weapons'].includes(this.activeTab)){
      const groups=this.activeTab==='weapons'?['weapons']:['engine','aerodynamics','armor'];
      const current=computeJetStats(this.config.modelId,this.config.modifications);
      const metrics=[['maxSpeedKmh','km/h'],['turnMult','handling'],['maxHp','HP'],['missiles','missiles'],['cannon','rounds'],['flares','flares'],['cannonDamage','damage']];
      return `<div class="mods-container">${groups.map(category=>`<section class="mod-category-block"><h4>${MODIFICATIONS[category].title}</h4><div class="mod-options-list">${Object.values(MODIFICATIONS[category].options).map(option=>{
        const selected=this.config.modifications[category]===option.id,unlocked=progression.isUnlocked('mod',option.id),next=computeJetStats(this.config.modelId,{...this.config.modifications,[category]:option.id});
        const requirement=RANKS.find(r=>r.unlockId===option.id);
        const delta=metrics.map(([key,label])=>{const change=Math.round((next[key]-current[key])*100)/100;return change?`${change>0?'+':''}${change} ${label}`:'';}).filter(Boolean).join(' · ');
        return `<div class="mod-card ${selected?'selected':''} ${unlocked?'':'locked-card'}" data-mod-cat="${category}" data-mod-id="${option.id}"><div class="mod-card-top"><strong>${option.name}</strong><span>${selected?'Equipped':unlocked?'Available':'Locked'}</span></div><p>${option.desc}</p>${!unlocked?`<small>Requires ${requirement?.name || 'higher rank'}${requirement?` · ${requirement.minXP} XP`:''}</small>`:''}<small class="stat-delta">${delta || 'Current performance'}</small></div>`;
      }).join('')}</div></section>`).join('')}</div>`;
    }

    return "";
  }

  bindTabEvents() {
    this.container.querySelectorAll(".hangar-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.activeTab = btn.dataset.tab;
        this.render();
      });
    });

    this.container.querySelectorAll(".jet-card").forEach((card) => {
      card.addEventListener("click", () => {
        this.selectModel(card.dataset.model);
      });
    });

    this.container.querySelectorAll(".livery-card").forEach((card) => {
      card.addEventListener("click", () => {
        this.selectLivery(card.dataset.livery);
      });
    });

    this.container.querySelectorAll(".mod-card").forEach((card) => {
      card.addEventListener("click", () => {
        this.selectMod(card.dataset.modCat, card.dataset.modId);
      });
    });

    this.container.querySelector("#hangar-toggle-orbit")?.addEventListener("click", () => {
      this.autoRotate = !this.autoRotate;
      this.render();
    });

    this.container.querySelector("#hangar-close-top")?.addEventListener("click", () => {
      this.close();
    });

    this.container.querySelector("#hangar-equip-launch")?.addEventListener("click", () => {
      this.game.equipJet(this.config);
      this.close(true);
    });

    // Pilot dossier modal open/close
    this.container.querySelector("#btn-open-pilot-dossier")?.addEventListener("click", () => {
      this.showDossier = true;
      this.render();
    });

    this.container.querySelector("#btn-open-dossier-footer")?.addEventListener("click", () => {
      this.showDossier = true;
      this.render();
    });

    this.container.querySelector("#btn-close-dossier")?.addEventListener("click", () => {
      this.showDossier = false;
      this.render();
    });

    this.container.querySelector("#btn-save-callsign")?.addEventListener("click", () => {
      const input = this.container.querySelector("#input-dossier-callsign");
      if (input && input.value) {
        progression.setCallsign(input.value);
        this.game.ui.message(`Callsign updated to "${escapeHTML(progression.profile.callsign)}"`);
        this.render();
      }
    });
  }

  update(dt) {
    if (this.autoRotate && this.game) {
      this.game.hangarAngle = (this.game.hangarAngle || 0) + dt * 0.25;
    }
  }

  close(launch = false) {
    this.game.endHangarPreview?.();
    window.removeEventListener("keydown",this.onKey,true);
    this.isDragging=false;this.container.remove();
    this.returnFocus?.focus?.();
    this.onClose?.(launch);
  }
}
