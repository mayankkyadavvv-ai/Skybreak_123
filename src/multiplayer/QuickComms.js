// QuickComms: Tactical radio communication & quick commands for multiplayer teams
export const COMM_COMMANDS = [
  { id: "spotted", key: "1", text: "Enemy Spotted!" },
  { id: "help", key: "2", text: "Need Immediate Backup!" },
  { id: "attack", key: "3", text: "Engage My Locked Target!" },
  { id: "cover", key: "4", text: "Cover My Six!" },
  { id: "missile", key: "5", text: "Break! Missile Incoming!" },
  { id: "rtb", key: "6", text: "Returning to Airbase to Rearm." },
  { id: "regroup", key: "7", text: "Form Up & Regroup on Me." }
];

export class QuickComms {
  constructor(game) {
    this.game = game;
    this.isOpen = false;
    this.isTeamOnly = true;
    this.feed = []; // [ { id, senderName, team, text, timestamp } ]
  }

  toggle(teamOnly = true) {
    this.isOpen = !this.isOpen;
    this.isTeamOnly = teamOnly;
    return this.isOpen;
  }

  close() {
    this.isOpen = false;
  }

  triggerCommand(numKey) {
    const cmd = COMM_COMMANDS.find((c) => c.key === String(numKey));
    if (!cmd) return false;

    this.sendComm(cmd.id, cmd.text, this.isTeamOnly);
    this.close();
    return true;
  }

  sendComm(commKey, commText, teamOnly = true) {
    if (!this.game.multiplayer?.network) return;

    this.game.multiplayer.network.send("quick_comm", {
      commKey,
      commText,
      teamOnly
    });

    // Add local echo to feed
    this.addFeedItem({
      senderName: this.game.multiplayer.localName || "You",
      team: this.game.multiplayer.localTeam || "blue",
      text: commText,
      teamOnly
    });
  }

  addFeedItem(item) {
    this.feed.push({
      ...item,
      id: Date.now() + Math.random(),
      timestamp: Date.now()
    });
    if (this.feed.length > 6) this.feed.shift();

    // Play subtle radio chirp audio
    this.game.audio?.play?.("lock");
  }

  getRecentFeed() {
    const now = Date.now();
    // Keep items for 7.5 seconds
    this.feed = this.feed.filter((item) => now - item.timestamp < 7500);
    return this.feed;
  }
}
