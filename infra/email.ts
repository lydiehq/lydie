/// <reference path="./../.sst/platform/config.d.ts" />

const domain = "lydie.co"

const sender = {
	production: domain,
	lars: `lars@${domain}`,
}

const emailOptions = {
	sender: sender[$app.stage as keyof typeof sender],
	...($app.stage === "production" && {
		dmarc: "v=DMARC1; p=quarantine; adkim=s; aspf=s;",
	}),
} as const

export const email = new sst.aws.Email("Email", {
	...emailOptions,
})
