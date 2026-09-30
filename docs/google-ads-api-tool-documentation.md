# Attica Gold SEO & Marketing Lead Attribution Dashboard

## Google Ads API Tool Documentation

Document date: 2026-08-19

Company: Attica Gold Company

Website: https://atticagoldcompany.com

Tool name: SEO & Marketing Lead Attribution Dashboard

Primary users: Internal Attica Gold employees only

Google Ads Manager Account: 156-754-9139

Google Cloud Project Number: 787842919369

Google Cloud Project ID: attica-analytics

Service Account: attica-analytics-dashboard@attica-analytics.iam.gserviceaccount.com

## 1. Business Model

Attica Gold Company operates gold buying and gold release service branches across India. Customers submit enquiries through Google Ads landing pages, website forms, blog pages, Meta lead forms, Justdial leads, and direct calls to the call center.

The business objective of the internal dashboard is to measure marketing performance from lead generation through call-center handling and billing conversion. The dashboard helps internal teams understand which sources, campaigns, keywords, landing pages, and lead forms generate qualified customers and actual billed transactions.

## 2. Tool Purpose

The SEO & Marketing Lead Attribution Dashboard is an internal reporting and attribution tool. It imports Google Ads reporting data into the Attica Gold backend database and combines it with local CRM, dialer, call-center, follow-up, and billing data.

The tool is used only for analytics and reporting. It does not create Google Ads accounts, create campaigns, edit campaigns, change bids, upload creatives, modify budgets, or manage ads.

## 3. Intended Audience

Access is limited to Attica Gold internal staff, including:

- Master Admin users
- Admin users with reporting permissions
- SEO and marketing users
- Management users reviewing source and campaign performance

The tool is not available to the general public or external customers.

## 4. Google Ads API Usage

The application uses the Google Ads API for reporting only.

Planned Google Ads API data includes:

- Campaign ID and campaign name
- Ad group ID and ad group name
- Ad ID and ad name
- Keyword ID and keyword text
- Search term
- Match type
- Impressions
- Clicks
- Cost
- Date-level campaign performance

The Google Ads API data is synchronized by the backend into the local database. The browser dashboard reads from local backend APIs only and does not call Google Ads directly.

## 5. Supported Campaign Types

The reporting tool is intended to support:

- Search
- Performance Max
- Display

## 6. Capabilities Provided

The tool provides the following Google Ads capability:

- Reporting

The tool does not provide:

- Account creation
- Campaign creation
- Campaign management
- Bid management
- Budget management
- Keyword planning services
- Remarketing API usage
- App conversion tracking

## 7. Authentication Architecture

The backend uses a Google Cloud service account for server-to-server authentication.

The service account obtains an OAuth access token using the required Google Ads scope:

https://www.googleapis.com/auth/adwords

The backend sends the Google Ads developer token with Google Ads API requests.

The Google Ads Manager Account associated with the developer token is:

156-754-9139

The Google Cloud project number associated with the API integration is:

787842919369

## 8. System Architecture

Data flow:

Google Ads API
-> Attica backend synchronization worker
-> Attica local MySQL reporting database
-> SEO & Marketing Lead Attribution Dashboard API
-> Internal dashboard UI

Other lead and conversion sources are also stored locally:

- Website lead forms
- Blog lead forms
- Meta lead forms
- Justdial leads
- Call-center call records
- Follow-up queue records
- Billing/customer conversion API records

## 9. Main Dashboard Sections

The dashboard contains these tabs:

1. Overview
2. Source Funnel
3. Campaign Performance
4. Keyword & Search Term
5. Website & Blog
6. Lead Journey
7. Bill Conversion History

## 10. Overview Metrics

The overview section shows:

- Leads today
- Unique leads today
- Contacted today
- Connected today
- Follow-ups today
- Qualified leads today
- Lost leads today
- Bills today
- Lead-to-bill conversion rate
- Billing amount
- Billed gross weight
- Campaign spend
- Cost per lead
- Cost per bill

All summary cards are clickable and open a filtered drill-down showing the exact records used to calculate the count.

## 11. Source Funnel

The Source Funnel groups leads by standardized source:

- Meta Ads
- Google Ads
- Google Organic
- Website Direct
- Blog
- Justdial
- Referral
- Manual
- Other

Each source row shows:

- Leads
- Contacted leads
- Connected leads
- Follow-up leads
- Qualified leads
- Lost leads
- Bills
- Billing amount
- Billed gross weight
- Conversion percentage

## 12. Campaign Performance

Campaign Performance shows Google Ads campaign reporting together with call-center and billing results.

Fields include:

- Platform
- Campaign ID
- Campaign name
- Ad group
- Ad
- Spend
- Impressions
- Clicks
- Leads
- Connected leads
- Qualified leads
- Bills
- Billing amount
- Cost per lead
- Cost per bill

The dashboard preserves campaign and ad group names instead of replacing them with file names or generic source labels.

## 13. Keyword and Search-Term Reporting

For Google Ads, the dashboard stores and displays both:

- Keyword: the keyword configured in Google Ads
- Search term: the actual user query that triggered the ad

These are kept as separate fields for accurate reporting.

For Meta Ads, keyword is displayed as N/A because Meta does not provide search keywords in the same way Google Search Ads does.

## 14. Website and Blog Reporting

Website and blog forms capture:

- UTM source
- UTM medium
- UTM campaign
- UTM term
- UTM content
- GCLID
- GBRAID
- WBRAID
- FBCLID
- Landing page URL
- Referrer URL
- Form name
- Page title
- Blog URL
- Blog title
- Device type

These fields allow the dashboard to connect paid and organic traffic to lead quality and billing outcomes.

## 15. Lead Journey

The Lead Journey table shows each lead from creation through call-center activity and billing.

Columns include:

- Lead date and time
- Lead ID
- Customer name
- Customer number
- Source
- Platform
- Campaign
- Ad group
- Ad
- Keyword
- Search term
- Landing page or blog
- Assigned agent
- Call attempts
- Connected calls
- Total talk time
- Latest disposition
- Current stage
- Bill status
- Bill date
- Bill amount
- Billed gross weight

Clicking a lead row opens the lead timeline.

## 16. Lead Timeline

The timeline records events such as:

- Lead received
- Entered dialer queue
- Assigned to agent
- Call attempted
- Customer connected
- Disposition saved
- Follow-up created
- Bill created

This lets internal teams audit the full path from marketing lead to billing conversion.

## 17. Bill Conversion History

The Bill Conversion History tab shows actual customer billing records from the customer/billing API.

Fields include:

- Bill date
- Customer name
- Customer number
- Original lead date
- Marketing source
- Campaign
- Ad, keyword, or page
- Bill IDs
- Bill count
- Bill amount
- Billed gross weight
- Credited agent
- Attribution reason

Bills are shown on the actual bill date. The lead date is kept separately and is not overwritten.

## 18. Billing Amount and Weight

Billing amount and billed weight are read from the local cache of the customer/billing API.

Billed gross weight is taken from the billing API GrossW field.

Billing amount is taken from explicit billing amount fields when present. If the source API provides gross weight and quotation rate but no explicit amount, the backend derives billing amount as:

Gross weight x quotation rate

Release amount fields are used for release records when supplied by the billing API.

## 19. Agent Attribution

Marketing attribution and agent attribution are separate.

Marketing attribution answers:

Which source, campaign, keyword, or page generated the lead?

Agent attribution answers:

Which call-center agent should receive credit for the billing conversion?

For billing attribution, the backend checks connected incoming and outgoing conversations with the customer in the previous 15 days. The bill is credited to the agent with the highest total actual talk time.

Failed, missed, RNR, busy, zero-duration, and duplicate call legs are excluded.

## 20. Duplicate Prevention

The dashboard prevents duplicate counting by using source-specific identifiers:

- Meta leadgen ID for Meta leads
- Website or form submission ID for website/blog leads
- Google lead submission ID or internal lead ID for Google leads
- Bill ID or remote billing ID for billing records

Phone numbers are normalized to connect lead, call, and billing records, but phone number alone is not used as the only unique lead key.

## 21. Data Security and Privacy

The tool is available only to authenticated internal users.

Customer phone numbers can be masked for SEO/marketing users. Master Admin users can view complete numbers when needed for operational review.

Google Ads credentials and service-account private keys are stored on the backend server and are not exposed to the browser.

The frontend dashboard calls only Attica backend APIs.

## 22. API Endpoints Used Internally

The internal dashboard reads from backend APIs such as:

- /api/seo-marketing/leads
- /api/seo-marketing/leads/export
- /api/seo-marketing/google/status

These APIs return filtered, paginated, backend-prepared data. Large raw datasets are not loaded directly into the browser.

## 23. Performance Controls

The dashboard uses:

- Server-side filtering
- Server-side pagination
- Default page size of 50 rows
- Backend-generated exports
- Local database synchronization
- Lightweight list responses
- Drill-down loading only when selected

This prevents browser freezes and avoids direct frontend calls to external Google APIs.

## 24. Compliance Summary

The Google Ads API will be used only for internal reporting and attribution.

The tool:

- Reads campaign, ad group, keyword, search term, click, cost, and performance reporting data
- Stores reporting data in the company database
- Combines marketing data with internal lead, call, follow-up, and billing data
- Displays reports to authorized internal users

The tool does not:

- Create or manage Google Ads campaigns
- Modify ads, bids, budgets, or targeting
- Create accounts
- Use remarketing APIs
- Use app conversion tracking APIs
- Expose data to public or external users
