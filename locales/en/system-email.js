// Server-rendered email copy; editorial survey content lives in data/.
const messages = {
  "footer": "This email was sent by Turufjell Vel Member Services.",
  "testLabel": "Test message:",
  "testPrefix": "TEST MESSAGE – ",
  "previewNotice": "The link opens a preview. Selections and test submissions are not saved.",
  "resultsNotice": "This is a preview of the results email. It has not been sent to the membership list.",
  "survey": "Member survey",
  "preview": "Preview the survey",
  "open": "Open the survey",
  "invitation": "Invitation: {title}",
  "invitationBody": "Turufjell Vel invites you to complete the survey. The response deadline is {deadline}.",
  "buttonHelp": "If the button does not work, copy this address into your browser:",
  "propertyPolicy": "Only one response is counted per property. If someone else receives the link and responds first, that response will count. The registered primary email address receives a receipt with the questions, answers and the email address that submitted the effective response.",
  "recipientPolicy": "Each invited email address may submit one independent response. The primary email address receives receipts for submitted responses.",
  "browserHelp": "If you have trouble opening or submitting the survey, open the link in a regular browser such as Safari, Chrome, Edge or Firefox. This is particularly relevant on mobile if the link first opens inside your email app.",
  "recipients": "This invitation is sent to the following recipients for the same property: {recipients}. Multiple recipients are notified.",
  "resultsSubject": "Member survey results",
  "distribution": "Distribution of responses",
  "signature": "The board of Turufjell Vel",
  "answers": "responses",
  "answered": "answered",
  "question": "Question {number}",
  "version": "version {version}",
  "ja": "Yes",
  "nei": "No",
  "usikker": "Not sure",
  "receipt": "Receipt: {title}",
  "accepted": "Your response has been registered and counts.",
  "notAccepted": "The submission was received but does not replace the first response. Only the first response counts for this property.",
  "plot": "Property: {number}",
  "submittedBy": "Submitted by: {email}",
  "effectiveRespondent": "Effective response from: {email}",
  "previousRecipient": "previously registered recipient",
  "subsequent": "Later submission (not counted):",
  "validity": "15 minutes",
  "secureLinkHelp": "The link is personal, valid for {validity}, and must not be forwarded. If the button does not work, copy this address:",
  "secureLinkTextHelp": "The link is personal, valid for {validity}, and must not be forwarded. If the button does not work, copy the address above into your browser.",
  "ignore": "If you did not request this, you can ignore this message.",
  "securityAlert": "Security notification",
  "access": {
    "subject": "Your secure access to membership details",
    "eyebrow": "My membership details",
    "heading": "View and update your details",
    "body": "We received a request to access the membership details registered with Turufjell Vel.",
    "action": "Open membership details"
  },
  "membership": {
    "subject": "Confirm your Turufjell Vel membership application",
    "eyebrow": "Membership application",
    "heading": "Confirm your email address",
    "body": "We received an application to register a new property. Confirm your email address so the administrator can see that it has been verified.",
    "action": "Confirm application"
  },
  "changeOld": {
    "subject": "Confirm primary email change",
    "heading": "Confirm that you requested the change",
    "body": "Someone requested a change to the primary email for your membership. Confirm the request before we send a separate verification to the new address.",
    "action": "Confirm request"
  },
  "changeNew": {
    "subject": "Confirm the new primary email address",
    "heading": "Confirm the new address",
    "body": "The old address has been verified. Confirm access to the new address before it is used.",
    "action": "Confirm new email address"
  },
  "securityCheck": "Security check",
  "changed": {
    "subject": "Primary email changed",
    "heading": "The change is complete",
    "body": "The primary email for your membership has been changed after verification of both the old and new addresses. All existing membership and survey sessions have been ended."
  },
  "changeStarted": {
    "subject": "Attempt to change primary email",
    "heading": "A change has been started",
    "body": "A change to the primary email for your membership was requested. If this was not you, contact Turufjell Vel as soon as possible."
  }
};

export default messages;
