import { JET_MODELS, LIVERIES, MODIFICATIONS, computeJetStats } from "../game/JetConfigs.js";

export class HangarUI {
  constructor(root, game, onClose) {
    this.root = root;
    this.game = game;
    this.onClose = onClose;
    this.activeTab = "fleet"; // fleet | liveries | performance | weapons
    this.config = { ...game.jetConfig, modifications: { ...game.jetConfig.modifications } };
    this.isDragging = false;
    this.lastPointerX = 0;
    this.autoRotate = true;

    this.container = document.createElement("div");
    this.container.id = "hangar-modal";
    this.container.className = "hangar-overlay";
    this.root.appendChild(this.container);

    this.bindPointerOrbit();
    this.render();
  }

  bindPointerOrbit() {
    this.container.addEventListener("pointerdown", (e) => {
      // Only drag if clicking on the 3D viewport area (not controls)
      if (e.target.closest(".hangar-panel") || e.target.closest("button") || e.target.closest("input")) return;
      this.isDragging = true;
      this.lastPointerX = e.clientX;
      this.autoRotate = false;
    });

    window.addEventListener("pointermove", (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastPointerX;
      this.lastPointerX = e.clientX;
      if (this.game) {
        this.game.hangarAngle = (this.game.hangarAngle || 0) - dx * 0.008;
      }
    });

    window.addEventListener("pointerup", () => {
      this.isDragging = false;
    });

    this.container.addEventListener("wheel", (e) => {
      if (e.target.closest(".hangar-tab-content")) return; // let tab scroll
      e.preventDefault();
      if (this.game) {
        this.game.hangarDistance = Math.min(45, Math.max(16, (this.game.hangarDistance || 26) + Math.sign(e.deltaY) * 2));
      }
    }, { passive: false });
  }

  selectModel(modelId) {
    this.config.modelId = modelId;
    this.game.equipJet(this.config);
    this.render();
  }

  selectLivery(liveryId) {
    this.config.liveryId = liveryId;
    this.game.equipJet(this.config);
    this.render();
  }

  selectMod(category, modId) {
    this.config.modifications[category] = modId;
    this.game.equipJet(this.config);
    this.render();
  }

  render() {
    const stats = computeJetStats(this.config.modelId, this.config.modifications);
    const activeModel = JET_MODELS[this.config.modelId] || JET_MODELS.x17;
    const activeLivery = LIVERIES[this.config.liveryId] || LIVERIES.grey;

    this.container.innerHTML = `
      <div class="hangar-hud-header">
        <div class="hangar-title-group">
          <span class="hangar-tag">SKYBREAK AEROSPACE LAB</span>
          <h2>HANGAR & CUSTOMIZATION STUDIO</h2>
        </div>
        <div class="hangar-actions">
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

          <div class="stat-chips-grid">
            <div class="stat-chip">
              <span class="chip-label">MISSILES</span>
              <span class="chip-val">🚀 ${stats.missiles}</span>
            </div>
            <div class="stat-chip">
              <span class="chip-label">CANNON RDS</span>
              <span class="chip-val">⚡ ${stats.cannon}</span>
            </div>
            <div class="stat-chip">
              <span class="chip-label">FLARES</span>
              <span class="chip-val">✨ ${stats.flares}</span>
            </div>
            <div class="stat-chip">
              <span class="chip-label">CANNON DMG</span>
              <span class="chip-val">💥 ${stats.cannonDamage}</span>
            </div>
          </div>
        </div>

        <div class="hangar-footer-buttons">
          <button class="hangar-equip-btn" id="hangar-equip-launch">
            <span class="play-icon">▶</span> EQUIP & FLY
          </button>
        </div>
      </div>

      <!-- Right Sidebar: Configuration Tabs & Modules -->
      <div class="hangar-sidebar hangar-right">
        <nav class="hangar-tabs-nav">
          <button class="hangar-tab-btn ${this.activeTab === "fleet" ? "active" : ""}" data-tab="fleet">✈️ FLEET</button>
          <button class="hangar-tab-btn ${this.activeTab === "liveries" ? "active" : ""}" data-tab="liveries">🎨 PAINT</button>
          <button class="hangar-tab-btn ${this.activeTab === "performance" ? "active" : ""}" data-tab="performance">⚙️ TUNING</button>
          <button class="hangar-tab-btn ${this.activeTab === "weapons" ? "active" : ""}" data-tab="weapons">🎯 WEAPONS</button>
        </nav>

        <div class="hangar-tab-content">
          ${this.renderTabContent()}
        </div>
      </div>

      <div class="hangar-tip-hint">
        <span>💡 DRAG TO ROTATE 3D JET · SCROLL WHEEL TO ZOOM</span>
      </div>
    `;

    this.bindTabEvents();
  }

  renderTabContent() {
    if (this.activeTab === "fleet") {
      return `
        <div class="fleet-list">
          ${Object.values(JET_MODELS).map((m) => {
            const isSelected = this.config.modelId === m.id;
            return `
              <div class="jet-card ${isSelected ? "selected" : ""}" data-model="${m.id}">
                <div class="jet-card-header">
                  <span class="jet-card-code">${m.code}</span>
                  <span class="jet-card-badge">${m.country}</span>
                </div>
                <h4 class="jet-card-title">${m.name}</h4>
                <div class="jet-card-role">${m.role}</div>
                <div class="jet-card-stats-mini">
                  <span>⚡ ${m.baseStats.speedKmh} km/h</span>
                  <span>🔄 Agility ${m.baseStats.agility}</span>
                  <span>🛡️ ${m.baseStats.armor} HP</span>
                </div>
                <div class="jet-card-footer">
                  ${isSelected ? "<span class='equipped-badge'>✓ EQUIPPED</span>" : "<button class='select-btn'>SELECT AIRCRAFT</button>"}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      `;
    }

    if (this.activeTab === "liveries") {
      return `
        <div class="liveries-list">
          ${Object.values(LIVERIES).map((l) => {
            const isSelected = this.config.liveryId === l.id;
            return `
              <div class="livery-card ${isSelected ? "selected" : ""}" data-livery="${l.id}">
                <div class="livery-swatch-circle" style="background: ${l.swatch}; border: 3px solid ${l.stripeColor ? "#" + l.stripeColor.toString(16).padStart(6, "0") : "#fff"}"></div>
                <div class="livery-info">
                  <span class="livery-tag">${l.tag}</span>
                  <h4 class="livery-title">${l.name}</h4>
                </div>
                ${isSelected ? "<span class='equipped-badge'>✓ ACTIVE</span>" : "<button class='select-btn'>APPLY</button>"}
              </div>
            `;
          }).join("")}
        </div>
      `;
    }

    if (this.activeTab === "performance") {
      return `
        <div class="mods-container">
          <div class="mod-category-block">
            <h4>PROPULSION & ENGINE</h4>
            <div class="mod-options-list">
              ${Object.values(MODIFICATIONS.engine.options).map((opt) => {
                const isSelected = this.config.modifications.engine === opt.id;
                return `
                  <div class="mod-card ${isSelected ? "selected" : ""}" data-mod-cat="engine" data-mod-id="${opt.id}">
                    <div class="mod-card-top">
                      <strong>${opt.name}</strong>
                      ${isSelected ? "<span class='active-check'>✓</span>" : ""}
                    </div>
                    <p>${opt.desc}</p>
                  </div>
                `;
              }).join("")}
            </div>
          </div>

          <div class="mod-category-block">
            <h4>AERODYNAMICS & WINGS</h4>
            <div class="mod-options-list">
              ${Object.values(MODIFICATIONS.aerodynamics.options).map((opt) => {
                const isSelected = this.config.modifications.aerodynamics === opt.id;
                return `
                  <div class="mod-card ${isSelected ? "selected" : ""}" data-mod-cat="aerodynamics" data-mod-id="${opt.id}">
                    <div class="mod-card-top">
                      <strong>${opt.name}</strong>
                      ${isSelected ? "<span class='active-check'>✓</span>" : ""}
                    </div>
                    <p>${opt.desc}</p>
                  </div>
                `;
              }).join("")}
            </div>
          </div>

          <div class="mod-category-block">
            <h4>AIRFRAME & ARMOR</h4>
            <div class="mod-options-list">
              ${Object.values(MODIFICATIONS.armor.options).map((opt) => {
                const isSelected = this.config.modifications.armor === opt.id;
                return `
                  <div class="mod-card ${isSelected ? "selected" : ""}" data-mod-cat="armor" data-mod-id="${opt.id}">
                    <div class="mod-card-top">
                      <strong>${opt.name}</strong>
                      ${isSelected ? "<span class='active-check'>✓</span>" : ""}
                    </div>
                    <p>${opt.desc}</p>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        </div>
      `;
    }

    if (this.activeTab === "weapons") {
      return `
        <div class="mods-container">
          <div class="mod-category-block">
            <h4>WEAPONS & MUNITIONS LOADOUT</h4>
            <div class="mod-options-list">
              ${Object.values(MODIFICATIONS.weapons.options).map((opt) => {
                const isSelected = this.config.modifications.weapons === opt.id;
                return `
                  <div class="mod-card ${isSelected ? "selected" : ""}" data-mod-cat="weapons" data-mod-id="${opt.id}">
                    <div class="mod-card-top">
                      <strong>${opt.name}</strong>
                      ${isSelected ? "<span class='active-check'>✓</span>" : ""}
                    </div>
                    <p>${opt.desc}</p>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        </div>
      `;
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
  }

  update(dt) {
    if (this.autoRotate && this.game) {
      this.game.hangarAngle = (this.game.hangarAngle || 0) + dt * 0.25;
    }
  }

  close(launch = false) {
    this.container.remove();
    this.onClose?.(launch);
  }
}
