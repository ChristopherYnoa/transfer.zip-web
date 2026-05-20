import mongoose from 'mongoose';
import crypto from "crypto"

import BrandProfile from './BrandProfile';

const EmailSharedWith = new mongoose.Schema({
    time: { type: Date, default: () => new Date(), required: true },
    email: String
}, { _id: false })

const TransferRequestSchema = new mongoose.Schema({
    active: { type: Boolean, default: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, required: true },
    // Set once at creation from author.team if the author is on a team.
    // Never updated — mirrors Transfer.team so that a request stays
    // attributed to the team it was created under even if the author
    // later leaves.
    team: { type: mongoose.Schema.Types.ObjectId, ref: "Team", index: true },
    brandProfile: { type: mongoose.Schema.Types.ObjectId, ref: "BrandProfile" },
    name: String,
    description: String,
    secretCode: { type: String, default: () => crypto.randomUUID(), required: true, index: true },

    emailsSharedWith: [EmailSharedWith]
}, { timestamps: true })

// store an email address that this request was shared with
TransferRequestSchema.methods.addSharedEmail = function (email) {
    this.emailsSharedWith.push({ email })
}

TransferRequestSchema.methods.toJsonAsOwner = function () {
    const { _id, active, name, description, secretCode, emailsSharedWith, createdAt, brandProfile } = this
    return {
        id: _id.toString(),
        active,
        name: name || "Untitled Request",
        description,
        secretCode,
        emailsSharedWith: emailsSharedWith.map(entry => ({ time: entry.time, email: entry.email })),
        createdAt,
        hasName: !!name,
        brandProfileId: brandProfile ? brandProfile.toString() : undefined,
    }
}

// Variant for team Owner/Admin viewing requests across the team.
// Omits emailsSharedWith (the contacts a member shared their request
// with are not the admin's business) but includes author identity and
// secretCode so the UI can show "created by X" and copy the upload
// link. The author must be populated.
TransferRequestSchema.methods.toJsonAsTeamAdmin = function () {
    const { _id, active, name, description, secretCode, createdAt } = this
    return {
        id: _id.toString(),
        active,
        name: name || "Untitled Request",
        description,
        secretCode,
        createdAt,
        hasName: !!name,
        author: this.author && typeof this.author === "object" && this.author._id ? {
            id: this.author._id.toString(),
            email: this.author.email,
            fullName: this.author.fullName,
        } : undefined,
    }
}

TransferRequestSchema.methods.toJsonAsUploader = function () {
    const { _id, name, description, secretCode, brandProfile } = this
    return {
        id: _id.toString(),
        name: name || "Untitled Request",
        description,
        secretCode,
        hasName: !!name,
        brandProfileId: brandProfile ? brandProfile.toString() : undefined,
    }
}

TransferRequestSchema.methods.getUploadLink = function () {
    return `${process.env.SITE_URL}/upload/${this.secretCode}`
}

export default mongoose.models.TransferRequest || mongoose.model("TransferRequest", TransferRequestSchema)