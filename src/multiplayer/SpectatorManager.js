// SpectatorManager: Allows spectating surviving teammates while waiting for respawn
import * as T from "three";

export class SpectatorManager {
  constructor(game) {
    this.game = game;
    this.isSpectating = false;
    this.currentTargetId = null;
    this.cameraMode = "chase"; // "chase" | "cinematic"
  }

  startSpectating() {
    this.isSpectating = true;
    this.selectNextTeammate(1);
  }

  stopSpectating() {
    this.isSpectating = false;
    this.currentTargetId = null;
    if (this.game.cam) {
      this.game.cam.mode = "chase";
    }
  }

  getTeammates() {
    const multi = this.game.multiplayer;
    if (!multi) return [];

    const myTeam = multi.localTeam || "blue";
    const aliveTeammates = [];

    for (const [id, remote] of multi.remotePlayers.entries()) {
      if (remote.team === myTeam && remote.alive && remote.model) {
        aliveTeammates.push({ id, name: remote.name, model: remote.model, jet: remote });
      }
    }
    return aliveTeammates;
  }

  selectNextTeammate(direction = 1) {
    const teammates = this.getTeammates();
    if (teammates.length === 0) {
      this.currentTargetId = null;
      return null;
    }

    const currentIndex = teammates.findIndex((t) => t.id === this.currentTargetId);
    let nextIndex = 0;

    if (currentIndex !== -1) {
      nextIndex = (currentIndex + direction + teammates.length) % teammates.length;
    }

    const selected = teammates[nextIndex];
    this.currentTargetId = selected.id;
    return selected;
  }

  getCurrentTarget() {
    if (!this.isSpectating || !this.currentTargetId) return null;
    const remote = this.game.multiplayer?.remotePlayers.get(this.currentTargetId);
    return remote && remote.alive ? remote : null;
  }

  toggleCameraMode() {
    this.cameraMode = this.cameraMode === "chase" ? "cinematic" : "chase";
    return this.cameraMode;
  }
}
