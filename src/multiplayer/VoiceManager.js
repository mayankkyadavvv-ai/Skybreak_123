/** Opt-in, room-authorized WebRTC voice. No microphones open before enable(). */
export class VoiceManager {
  constructor(network, { mediaDevices = globalThis.navigator?.mediaDevices, PeerConnection = globalThis.RTCPeerConnection, createAudio } = {}) {
    this.network = network; this.mediaDevices = mediaDevices; this.PeerConnection = PeerConnection;
    this.createAudio = createAudio || (() => { const element = document.createElement('audio'); element.autoplay = true; element.setAttribute('playsinline', ''); element.hidden = true; document.body.appendChild(element); return element; });
    this.stream = null; this.enabled = false; this.muted = false; this.deafened = false; this.talking = false;
    this.relayAvailable = false; this.iceServers = []; this.peers = new Map(); this.volumes = new Map();
    this.status = 'OFF'; this.error = ''; this.generation = 0; this.allowedPeers = new Set();
    this.unsubscribers = [
      network.on('voice_config', msg => this.configure(msg)),
      network.on('voice_signal', msg => this.signal(msg)),
      network.on('voice_peer_joined', msg => { const id = msg.id || msg.playerId; if (id) { this.allowedPeers.add(id); this.connectPeer(id); } }),
      network.on('voice_peer_left', msg => this.removePeer(msg.id || msg.playerId)),
      network.on('disconnected', () => this.disable('Network disconnected. Enable voice again after resuming.')),
      network.on('voice_error', msg => { this.error = msg.message || msg.reason || 'Voice channel unavailable.'; this.disable(this.error); }),
    ];
    this.deviceChanged = () => { if (this.enabled) { this.error = 'Audio devices changed. Choose microphone again if needed.'; this.notify(); } };
    this.mediaDevices?.addEventListener?.('devicechange', this.deviceChanged);
    this.onChange = null;
  }
  notify() { this.onChange?.(this.getState()); }
  getState() { return { enabled: this.enabled, muted: this.muted, deafened: this.deafened, talking: this.talking, relayAvailable: this.relayAvailable, status: this.status, error: this.error, peers: [...this.peers].map(([id, peer]) => ({ id, connected: peer.pc.connectionState === 'connected', volume: this.volumes.get(id) ?? 1, muted: peer.audio?.muted })) }; }
  async enable(deviceId) {
    if (this.enabled) return true;
    if (!this.mediaDevices?.getUserMedia || !this.PeerConnection) { this.error = 'Voice requires HTTPS or localhost, microphone permission and WebRTC support. Text pings still work.'; this.status = 'UNAVAILABLE'; this.notify(); return false; }
    const generation = ++this.generation; this.status = 'REQUESTING MICROPHONE'; this.error = ''; this.notify();
    try {
      const stream = await this.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) }, video: false });
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return false; }
      this.stream = stream; this.enabled = true; this.talking = false;
      for (const track of stream.getAudioTracks()) { track.enabled = false; track.onended = () => this.disable('Microphone disconnected. Select it again to continue.'); }
      this.status = 'JOINING';
      if (!this.network.send('voice_join')) { this.disable('No room connection. Join a room, then enable voice.'); return false; }
      this.notify(); return true;
    } catch (error) { if (generation !== this.generation) return false; this.error = error.name === 'NotAllowedError' ? 'Microphone permission denied. Allow it in browser site settings, then retry.' : `Microphone unavailable: ${error.message || error.name}`; this.status = 'MICROPHONE BLOCKED'; this.notify(); return false; }
  }
  async changeDevice(deviceId) { const wasEnabled = this.enabled; this.disable(); if (wasEnabled) return this.enable(deviceId); return false; }
  async devices() { try { return (await this.mediaDevices?.enumerateDevices?.() || []).filter(d => d.kind === 'audioinput'); } catch { return []; } }
  configure(msg) {
    if (!this.enabled) return;
    this.relayAvailable = msg.relayAvailable === true; this.iceServers = Array.isArray(msg.iceServers) ? msg.iceServers : [];
    this.status = this.relayAvailable ? 'READY · HOLD TO TALK' : 'DIRECT VOICE · RELAY UNAVAILABLE';
    this.error = this.relayAvailable ? '' : 'TURN relay is not provisioned. Cross-network voice is not verified and may fail; team pings remain available.';
    this.allowedPeers = new Set((msg.peers || []).map(p => typeof p === 'string' ? p : p.id));
    for (const id of this.allowedPeers) this.connectPeer(id);
    this.notify();
  }
  connectPeer(id) {
    if (!this.enabled || !id || id === this.network.clientId || !this.allowedPeers.has(id)) return null;
    if (this.peers.has(id)) return this.peers.get(id);
    const pc = new this.PeerConnection({ iceServers: this.iceServers, bundlePolicy: 'max-bundle' });
    const peer = { pc, audio: null, makingOffer: false, ignoreOffer: false, polite: String(this.network.clientId) > String(id), pendingCandidates: [] };
    this.peers.set(id, peer);
    for (const track of this.stream.getTracks()) pc.addTrack(track, this.stream);
    pc.onicecandidate = ({ candidate }) => { if (candidate) this.network.send('voice_signal', { targetId: id, candidate: candidate.toJSON?.() || candidate }); };
    pc.onnegotiationneeded = async () => {
      try { peer.makingOffer = true; await pc.setLocalDescription(); this.network.send('voice_signal', { targetId: id, description: pc.localDescription }); }
      catch { this.error = 'Voice negotiation failed. Toggle voice to retry.'; this.notify(); }
      finally { peer.makingOffer = false; }
    };
    pc.ontrack = ({ streams, track }) => {
      if (!peer.audio) peer.audio = this.createAudio();
      peer.audio.srcObject = streams[0] || new MediaStream([track]); peer.audio.volume = this.volumes.get(id) ?? 1; peer.audio.muted = this.deafened;
      peer.audio.play?.().catch(() => { this.error = 'Browser blocked squad audio. Press Enable audio in voice settings.'; this.notify(); });
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') this.error = 'A squad voice connection failed. A TURN relay may be required.'; this.notify(); };
    return peer;
  }
  async signal(msg) {
    const id = msg.fromId || msg.senderId;
    if (!this.enabled || !this.allowedPeers.has(id)) return;
    const peer = this.connectPeer(id); if (!peer) return;
    const pc = peer.pc;
    try {
      if (msg.description) {
        const collision = msg.description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && collision; if (peer.ignoreOffer) return;
        if (collision && peer.polite) await pc.setLocalDescription({ type: 'rollback' });
        await pc.setRemoteDescription(msg.description);
        for (const candidate of peer.pendingCandidates.splice(0)) await pc.addIceCandidate(candidate);
        if (msg.description.type === 'offer') { await pc.setLocalDescription(); this.network.send('voice_signal', { targetId: id, description: pc.localDescription }); }
      } else if (msg.candidate && !peer.ignoreOffer) {
        if (pc.remoteDescription) await pc.addIceCandidate(msg.candidate); else if (peer.pendingCandidates.length < 80) peer.pendingCandidates.push(msg.candidate);
      }
    } catch { this.error = 'Voice handshake failed. Rejoin voice to retry.'; this.notify(); }
  }
  setTalking(value) {
    const talking = !!value && this.enabled && !this.muted;
    if (talking === this.talking) return;
    this.talking = talking; for (const track of this.stream?.getAudioTracks() || []) track.enabled = talking; this.notify();
  }
  setMuted(value) { this.muted = !!value; if (this.muted) this.setTalking(false); this.notify(); }
  setDeafened(value) { this.deafened = !!value; for (const peer of this.peers.values()) if (peer.audio) peer.audio.muted = this.deafened; this.notify(); }
  setVolume(id, value) { const volume = Math.max(0, Math.min(1, Number(value) || 0)); this.volumes.set(id, volume); const audio = this.peers.get(id)?.audio; if (audio) audio.volume = volume; }
  async resumeAudio() { for (const peer of this.peers.values()) { try { await peer.audio?.play?.(); } catch {} } }
  removePeer(id) { this.allowedPeers.delete(id); const peer = this.peers.get(id); if (!peer) return; peer.pc.ontrack = peer.pc.onicecandidate = peer.pc.onnegotiationneeded = peer.pc.onconnectionstatechange = null; peer.pc.close(); if (peer.audio) { peer.audio.pause?.(); peer.audio.srcObject = null; peer.audio.remove?.(); } this.peers.delete(id); this.notify(); }
  disable(reason = '') {
    ++this.generation; if (this.enabled) this.network.send('voice_leave');
    this.enabled = false; this.talking = false;
    for (const track of this.stream?.getTracks() || []) { track.onended = null; track.stop(); } this.stream = null;
    for (const id of [...this.peers.keys()]) this.removePeer(id);
    this.allowedPeers.clear(); this.status = 'OFF'; if (reason) this.error = reason; this.notify();
  }
  dispose() { this.disable(); this.unsubscribers.forEach(off => off()); this.mediaDevices?.removeEventListener?.('devicechange', this.deviceChanged); this.onChange = null; }
}
