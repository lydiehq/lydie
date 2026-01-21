import { Image } from "@tiptap/extension-image"

export const ImageUpload = Image.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			alt: {
				default: "",
			},
		}
	},
	addCommands() {
		return {
			...this.parent?.(),
			setImage: (options) => {
				return ({ commands }) => {
					return commands.insertContent({
						type: this.name,
						attrs: options,
					})
				}
			},
		}
	},
})
