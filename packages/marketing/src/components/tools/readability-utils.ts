// Client-side readability analysis utilities

export interface ReadabilityResult {
	fleschKincaid: {
		score: number
		gradeLevel: string
		readabilityLevel: string
	}
	wordCount: number
	characterCount: number
	characterCountNoSpaces: number
	sentenceCount: number
	paragraphCount: number
	readingTime: {
		minutes: number
		seconds: number
		totalSeconds: number
	}
}

export interface ReadabilityIssue {
	type: "long-sentence" | "very-long-sentence" | "adverb" | "passive-voice" | "complex-word"
	text: string
	start: number
	end: number
	severity: "warning" | "error"
	suggestion?: string
}

// Flesch-Kincaid Reading Ease formula
export function calculateFleschKincaid(text: string): {
	score: number
	gradeLevel: string
} {
	const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0)
	const words = text.split(/\s+/).filter((w) => w.length > 0)
	const syllables = words.reduce((count, word) => {
		return count + countSyllables(word)
	}, 0)

	if (sentences.length === 0 || words.length === 0) {
		return { score: 0, gradeLevel: "N/A" }
	}

	const avgSentenceLength = words.length / sentences.length
	const avgSyllablesPerWord = syllables / words.length

	// Flesch Reading Ease formula
	const score = 206.835 - 1.015 * avgSentenceLength - 84.6 * avgSyllablesPerWord

	// Flesch-Kincaid Grade Level formula
	const gradeLevel = 0.39 * avgSentenceLength + 11.8 * avgSyllablesPerWord - 15.59

	// Clamp score to 0-100 range
	const clampedScore = Math.max(0, Math.min(100, Math.round(score * 10) / 10))
	const roundedGrade = Math.max(0, Math.min(12, Math.round(gradeLevel * 10) / 10))

	let gradeLevelText: string
	if (roundedGrade < 1) {
		gradeLevelText = "Kindergarten"
	} else if (roundedGrade < 6) {
		gradeLevelText = `Grade ${Math.round(roundedGrade)}`
	} else if (roundedGrade < 9) {
		gradeLevelText = `Grade ${Math.round(roundedGrade)} (Middle School)`
	} else if (roundedGrade < 13) {
		gradeLevelText = `Grade ${Math.round(roundedGrade)} (High School)`
	} else {
		gradeLevelText = "College"
	}

	return {
		score: clampedScore,
		gradeLevel: gradeLevelText,
	}
}

// Simple syllable counting (approximation)
function countSyllables(word: string): number {
	word = word.toLowerCase()
	if (word.length <= 3) return 1
	word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
	word = word.replace(/^y/, "")
	const matches = word.match(/[aeiouy]{1,2}/g)
	return matches ? Math.max(1, matches.length) : 1
}

// Calculate reading time (average reading speed: 200 words per minute)
export function calculateReadingTime(wordCount: number): {
	minutes: number
	seconds: number
	totalSeconds: number
} {
	const wordsPerMinute = 200
	const totalSeconds = Math.ceil((wordCount / wordsPerMinute) * 60)
	const minutes = Math.floor(totalSeconds / 60)
	const seconds = totalSeconds % 60

	return {
		minutes,
		seconds,
		totalSeconds,
	}
}

export function analyzeReadability(text: string): ReadabilityResult {
	const words = text.split(/\s+/).filter((w) => w.length > 0)
	const wordCount = words.length
	const characterCount = text.length
	const characterCountNoSpaces = text.replace(/\s/g, "").length
	const sentenceCount = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length
	const paragraphCount = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length

	const { score, gradeLevel } = calculateFleschKincaid(text)
	const readingTime = calculateReadingTime(wordCount)

	// Determine readability level based on score
	let readabilityLevel: string
	if (score >= 90) {
		readabilityLevel = "Very Easy"
	} else if (score >= 80) {
		readabilityLevel = "Easy"
	} else if (score >= 70) {
		readabilityLevel = "Fairly Easy"
	} else if (score >= 60) {
		readabilityLevel = "Standard"
	} else if (score >= 50) {
		readabilityLevel = "Fairly Difficult"
	} else if (score >= 30) {
		readabilityLevel = "Difficult"
	} else {
		readabilityLevel = "Very Difficult"
	}

	return {
		fleschKincaid: {
			score,
			gradeLevel,
			readabilityLevel,
		},
		wordCount,
		characterCount,
		characterCountNoSpaces,
		sentenceCount,
		paragraphCount,
		readingTime,
	}
}

// Common adverbs that weaken writing
const COMMON_ADVERBS = [
	"very",
	"really",
	"quite",
	"rather",
	"pretty",
	"fairly",
	"extremely",
	"incredibly",
	"totally",
	"completely",
	"absolutely",
	"definitely",
	"probably",
	"possibly",
	"perhaps",
	"maybe",
	"actually",
	"basically",
	"simply",
	"just",
	"only",
	"merely",
	"barely",
	"hardly",
	"slightly",
	"somewhat",
	"relatively",
	"particularly",
	"especially",
	"specifically",
	"generally",
	"usually",
	"typically",
	"normally",
	"commonly",
	"often",
	"frequently",
	"rarely",
	"seldom",
	"never",
	"always",
	"constantly",
	"continuously",
	"repeatedly",
	"regularly",
	"occasionally",
	"sometimes",
	"suddenly",
	"quickly",
	"slowly",
	"rapidly",
	"gradually",
	"immediately",
	"instantly",
	"eventually",
	"finally",
	"ultimately",
	"recently",
	"lately",
	"currently",
	"previously",
	"earlier",
	"later",
	"soon",
	"already",
	"still",
	"yet",
	"again",
	"once",
	"twice",
	"here",
	"there",
	"where",
	"everywhere",
	"somewhere",
	"anywhere",
	"nowhere",
	"away",
	"back",
	"forward",
	"ahead",
	"behind",
	"up",
	"down",
	"out",
	"in",
	"on",
	"off",
	"over",
	"under",
	"above",
	"below",
	"inside",
	"outside",
	"nearby",
	"far",
	"close",
	"together",
	"apart",
	"alone",
	"along",
	"across",
	"through",
	"around",
	"about",
	"almost",
	"nearly",
	"approximately",
	"exactly",
	"precisely",
	"roughly",
	"about",
	"around",
	"roughly",
	"exactly",
	"precisely",
]

// Complex words (3+ syllables, excluding common words)
function isComplexWord(word: string): boolean {
	const cleanWord = word.toLowerCase().replace(/[^a-z]/g, "")
	if (cleanWord.length < 6) return false // Short words are usually simple
	const syllables = countSyllables(cleanWord)
	return syllables >= 3
}

// Passive voice patterns
const PASSIVE_PATTERNS = [
	/\b(am|is|are|was|were|be|been|being)\s+\w+ed\b/gi,
	/\b(am|is|are|was|were|be|been|being)\s+\w+en\b/gi,
	/\b(get|got|gets)\s+\w+ed\b/gi,
]

// Find all readability issues in text
export function findReadabilityIssues(text: string): ReadabilityIssue[] {
	const issues: ReadabilityIssue[] = []

	// Split into sentences
	const sentences = text.match(/[^.!?]+[.!?]+/g) || []
	let currentPos = 0

	sentences.forEach((sentence) => {
		const sentenceStart = text.indexOf(sentence, currentPos)
		const sentenceEnd = sentenceStart + sentence.length
		const sentenceText = sentence.trim()
		const wordCount = sentenceText.split(/\s+/).filter((w) => w.length > 0).length

		// Check for very long sentences (25+ words) - red highlight
		if (wordCount >= 25) {
			issues.push({
				type: "very-long-sentence",
				text: sentenceText,
				start: sentenceStart,
				end: sentenceEnd,
				severity: "error",
				suggestion: "This sentence is too long and complex. Split it into shorter sentences.",
			})
		}
		// Check for long sentences (18-24 words) - yellow highlight
		else if (wordCount >= 18) {
			issues.push({
				type: "long-sentence",
				text: sentenceText,
				start: sentenceStart,
				end: sentenceEnd,
				severity: "warning",
				suggestion: "This sentence is getting long. Consider shortening it.",
			})
		}

		currentPos = sentenceEnd
	})

	// Find adverbs - use regex to find all occurrences
	COMMON_ADVERBS.forEach((adverb) => {
		const regex = new RegExp(`\\b${adverb}\\b`, "gi")
		let match
		while ((match = regex.exec(text)) !== null) {
			issues.push({
				type: "adverb",
				text: match[0],
				start: match.index,
				end: match.index + match[0].length,
				severity: "warning",
				suggestion: `Consider removing "${match[0]}" or using a stronger verb instead.`,
			})
		}
	})

	// Find passive voice
	PASSIVE_PATTERNS.forEach((pattern) => {
		let match
		while ((match = pattern.exec(text)) !== null) {
			issues.push({
				type: "passive-voice",
				text: match[0],
				start: match.index,
				end: match.index + match[0].length,
				severity: "warning",
				suggestion: "Consider using active voice instead of passive voice.",
			})
		}
	})

	// Find complex words - find all occurrences
	const wordMatches = text.match(/\b\w+\b/g) || []
	const seenWords = new Set<string>()

	wordMatches.forEach((word) => {
		const lowerWord = word.toLowerCase()
		if (!seenWords.has(lowerWord) && isComplexWord(word)) {
			seenWords.add(lowerWord)
			// Find all occurrences of this word
			const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi")
			let match
			while ((match = regex.exec(text)) !== null) {
				issues.push({
					type: "complex-word",
					text: match[0],
					start: match.index,
					end: match.index + match[0].length,
					severity: "warning",
					suggestion: `Consider using a simpler word instead of "${match[0]}".`,
				})
			}
		}
	})

	// Sort by position
	return issues.sort((a, b) => a.start - b.start)
}
