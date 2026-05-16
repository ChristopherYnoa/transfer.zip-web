import mongoose from "mongoose"
import "./User"
import "./Team"

const BrandProfileSchema = new mongoose.Schema({
  // `author` is the creator and stays set for audit. For solo users it's
  // also the scope (their personal profile). For team profiles it's just
  // "who first created this", since the team field is what scopes.
  author: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
  // Set at creation when the creator is on a team; never updated. A
  // profile is either team-scoped (team set) or personal (team unset).
  team: { type: mongoose.Schema.Types.ObjectId, ref: "Team", index: true },
  name: { type: String, required: true },
  iconUrl: { type: String },
  backgroundUrl: { type: String },
  domain: { type: String },
  lastUsed: { type: Date }
}, { timestamps: true })

BrandProfileSchema.methods.toJsonAsClient = function () {
  return {
    id: this._id.toString(),
    name: this.name,
    iconUrl: this.iconUrl,
    backgroundUrl: this.backgroundUrl,
    lastUsed: this.lastUsed
    // TODO: custom domains
    // domain: this.domain
  }
}

export default mongoose.models.BrandProfile || mongoose.model("BrandProfile", BrandProfileSchema)
