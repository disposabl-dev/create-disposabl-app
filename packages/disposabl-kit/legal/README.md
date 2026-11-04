# Draft legal pages

Every generated app includes public `/legal`, `/legal/privacy`, `/legal/terms`, `/legal/privacy-request`, and `/legal/delete-account` pages. They remain available when frontend authentication is disabled. The shared footer links to them.

The text comes from the existing Disposabl legal draft. It is unfinished and displays a draft notice. Edit `config.ts` and the documents for your own operator, contact, audience, retention, transfers, and actual data practices. App names come from the generated root package name. Provider descriptions follow the selected features. Set `reviewed` only after reviewing the completed documents.

Privacy and deletion pages provide contact instructions. They do not submit requests, delete accounts, or claim to issue deletion receipts. There is no new sign-in agreement or checkbox.
