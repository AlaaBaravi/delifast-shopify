# Delifast Shopify App

A multi-store Shopify app that integrates with the Delifast delivery system. This app allows multiple Shopify stores to automatically send orders to Delifast for fulfillment.

## Features

### Core Functionality
- **Multi-Store Support**: Install on multiple Shopify stores with independent settings
- **Automatic Order Sending**: Send orders to Delifast automatically when paid or created
- **Manual Order Sending**: Send orders manually from the admin interface
- **Status Sync**: Automatic hourly synchronization of shipment statuses
- **Temporary ID Resolution**: Automatic resolution of temporary shipment IDs

### Settings (3 Tabs)
1. **General Settings**: Delifast credentials, mode (auto/manual), auto-send trigger
2. **Sender Settings**: Sender name, address, mobile, city, area
3. **Shipping Settings**: Default weight, dimensions, city, payment method, fees

### Admin Interface
- Dashboard with connection status and shipment overview
- View all shipments with status
- Refresh individual shipment status
- Update temporary shipment IDs manually
- View activity logs
- Test API connection

### Background Jobs
- **Hourly Status Sync**: Updates status for all active shipments
- **Hourly Temp ID Update**: Resolves temporary IDs to real ones
- **4-Hour Pending Check**: Finds stuck orders and marks them for attention

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Shopify Stores                               │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                  │
│  │ Store A  │    │ Store B  │    │ Store N  │                  │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘                  │
│       │               │               │                         │
│       └───────────────┴───────────────┘                         │
│                       │                                         │
│                       ▼                                         │
├─────────────────────────────────────────────────────────────────┤
│                 Delifast Shopify App                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                      OAuth                                 │ │
│  │         (Per-store authentication via Shopify SDK)         │ │
│  └────────────────────────┬───────────────────────────────────┘ │
│                           │                                     │
│  ┌────────────────────────┼───────────────────────────────────┐ │
│  │                   Database                                 │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │ │
│  │  │  Sessions   │ │  Settings   │ │  Shipments  │          │ │
│  │  │ (per store) │ │ (per store) │ │ (per store) │          │ │
│  │  └─────────────┘ └─────────────┘ └─────────────┘          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                           │                                     │
│  ┌────────────────────────┼───────────────────────────────────┐ │
│  │                   Services                                 │ │
│  │  • delifastClient  • orderMapper  • orderHandler           │ │
│  │  • tokenManager    • logger       • jobs                   │ │
│  └────────────────────────┬───────────────────────────────────┘ │
│                           │                                     │
├───────────────────────────┼─────────────────────────────────────┤
│                           ▼                                     │
│                  Delifast Portal API                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  • Login        • Create Shipment   • Get Status           │ │
│  │  • Lookup       • Get Cities        • Cancel               │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

### Prerequisites
- Node.js 20+ (see engines in package.json)
- Shopify Partner account or store with custom app access
- Delifast account

### Setup

1. **Navigate to the app directory**:
   ```bash
   cd delifast-shopify/delifast
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment**:
   ```bash
   cp env.example.txt .env
   # Edit .env with your values
   ```

4. **Initialize database**:
   ```bash
   npm run setup
   ```

5. **Start development**:
   ```bash
   npm run dev
   ```

   This will start the Shopify CLI which handles tunneling and OAuth.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `SHOPIFY_API_KEY` | Your Shopify app API key |
| `SHOPIFY_API_SECRET` | Your Shopify app secret |
| `SHOPIFY_APP_URL` | Your app URL (auto-configured in dev) |
| `DATABASE_URL` | SQLite database path |
| `ENCRYPTION_KEY` | 32-char key for encrypting Delifast credentials |
| `JOB_SECRET` | Secret token for authenticating cron job requests |

## Deployment

### Shopify App Hosting

Deploy using Shopify's recommended methods:

1. **Using Shopify CLI**:
   ```bash
   npm run deploy
   ```

2. **Manual deployment**: Deploy to any Node.js hosting platform (Heroku, Railway, Render, etc.)

### Database

For production, consider migrating from SQLite to PostgreSQL:

1. Update `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

2. Run migrations:
   ```bash
   npm run setup
   ```

### Background Jobs

The app provides API endpoints for background jobs. Set up external cron jobs to call these:

| Endpoint | Frequency | Purpose |
|----------|-----------|---------|
| `POST /api/jobs/sync-statuses` | Hourly | Sync shipment statuses |
| `POST /api/jobs/update-temp-ids` | Hourly | Resolve temporary IDs |
| `POST /api/jobs/check-pending` | Every 4 hours | Find stuck orders |

Example cron configuration:
```bash
# Sync statuses every hour
0 * * * * curl -X POST https://your-app.com/api/jobs/sync-statuses -H "Authorization: Bearer YOUR_JOB_SECRET"

# Update temp IDs every hour at :30
30 * * * * curl -X POST https://your-app.com/api/jobs/update-temp-ids -H "Authorization: Bearer YOUR_JOB_SECRET"

# Check pending every 4 hours
0 */4 * * * curl -X POST https://your-app.com/api/jobs/check-pending -H "Authorization: Bearer YOUR_JOB_SECRET"
```

## Multi-Store Support

This app is designed to support multiple Shopify stores:

1. **Independent Settings**: Each store has its own Delifast credentials and configuration
2. **Per-Store Data**: Shipments and logs are isolated per store
3. **OAuth Authentication**: Shopify's OAuth handles per-store access tokens
4. **Webhooks**: Each store's webhooks are processed independently

### Installing on Additional Stores

1. In your Shopify Partner Dashboard, get the app installation URL
2. Visit the URL from your Shopify store admin
3. Authorize the app
4. Configure Delifast credentials in Settings

## UAE City Mapping

The app automatically maps UAE emirates to Delifast city IDs:

| Emirate | Code | City ID |
|---------|------|---------|
| Abu Dhabi | AE-AZ | 5 |
| Ajman | AE-AJ | 6 |
| Al Ain | AE-AL | 7 |
| Dubai | AE-DU | 8 |
| Fujairah | AE-FU | 9 |
| Ras Al Khaimah | AE-RK | 10 |
| Sharjah | AE-SH | 11 |
| Umm Al Quwain | AE-UQ | 12 |
| Western Region | AE-WR | 14 |

## Status Mapping

| Delifast Status | Simplified | Shopify Tag |
|-----------------|------------|-------------|
| 0, "new" | new | delifast-new |
| 1-4, 20, "transit" | in_transit | delifast-in-transit |
| 5, 100, "delivered" | completed | delifast-delivered |
| 6, 101, "cancelled" | cancelled | delifast-cancelled |
| 7, 102, "returned" | returned | delifast-returned |

## Project Structure

```
delifast-shopify/
└── delifast/                    # Main Shopify app
    ├── app/
    │   ├── routes/
    │   │   ├── app._index.jsx       # Dashboard
    │   │   ├── app.jsx              # App layout
    │   │   ├── app.settings.jsx     # Settings page
    │   │   ├── app.orders.jsx       # Orders page
    │   │   ├── app.logs.jsx         # Logs page
    │   │   ├── api.jobs.*.jsx       # Background job endpoints
    │   │   └── webhooks.*.jsx       # Webhook handlers
    │   ├── services/
    │   │   ├── config.server.js     # App configuration
    │   │   ├── delifastClient.server.js  # Delifast API client
    │   │   ├── tokenManager.server.js    # Token caching
    │   │   ├── orderMapper.server.js     # Order data mapper
    │   │   ├── orderHandler.server.js    # Order processing
    │   │   ├── jobs.server.js            # Background jobs
    │   │   ├── logger.server.js          # Logging service
    │   │   └── encryption.server.js      # Credential encryption
    │   ├── utils/
    │   │   ├── cityMapping.js       # UAE city mapping
    │   │   └── statusMapping.js     # Status code mapping
    │   ├── db.server.js             # Prisma client
    │   └── shopify.server.js        # Shopify SDK config
    ├── prisma/
    │   └── schema.prisma            # Database schema
    ├── shopify.app.toml             # Shopify app config
    └── package.json
```

## Delifast API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `POST /api/Login/Login` | Authentication |
| `POST /api/Customer/WooCommerceCreateShipment` | Create shipment |
| `POST /api/Customer/WooCommerceShipmentstatue` | Get status |
| `POST /api/Customer/LookupOrderShipments` | Lookup by order |
| `GET /api/Customer/GetCities` | List cities |
| `GET /api/Customer/GetAreas` | List areas |
| `POST /api/Customer/CancelShipment` | Cancel shipment |

## Troubleshooting

### Connection Issues
1. Verify Delifast credentials in Settings
2. Use "Test Connection" button
3. Check logs for API errors

### Orders Not Sending
1. Verify mode is set to "auto"
2. Check auto-send trigger matches order status
3. Ensure webhooks are registered (check Shopify admin > Settings > Notifications)

### Temporary IDs Not Resolving
1. Wait for hourly job to run
2. Check lookup attempts in logs
3. Manually update ID if needed via Orders page

### Multi-Store Issues
1. Ensure each store has its own Delifast credentials
2. Check that webhooks are registered for each store
3. Verify database has correct store settings

## Development

### Running locally
```bash
cd delifast
npm run dev
```

### Database migrations
```bash
npm run prisma migrate dev
```

### Viewing the database
```bash
npm run prisma studio
```

## License

MIT License - Built for Delifast shipping integration.
