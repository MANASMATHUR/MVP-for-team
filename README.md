# Houston Inventory Management System

A comprehensive inventory management system for professional basketball teams, featuring AI-powered insights, voice commands, automated ordering, and real-time analytics.

## Features

### 🎯 Core Features
- **Modern Dashboard**: Real-time analytics and insights
- **Inventory Management**: Track jersey inventory with advanced filtering and sorting
- **Voice Commands**: Use natural language to manage inventory
- **Automated Ordering**: AI-powered order optimization and Voiceflow integration
- **Call Logging**: Track all order calls with detailed analytics
- **Real-time Notifications**: Low stock alerts and system updates

### 🤖 AI-Powered Features
- **Smart Analytics**: OpenAI-powered inventory analysis and recommendations
- **Order Optimization**: AI suggests optimal order quantities
- **Report Generation**: Automated inventory reports with insights
- **Voice Interpretation**: Natural language processing for voice commands

### 📊 Analytics & Reporting
- **Dashboard Metrics**: Total inventory, low stock items, inventory value
- **Call Analytics**: Success rates, duration tracking, order completion
- **Activity Logs**: Comprehensive audit trail
- **Export Functionality**: CSV export and AI-generated reports

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Real-time)
- **AI**: OpenAI GPT-4o-mini
- **Voice**: Voiceflow API integration
- **Charts**: Recharts
- **Icons**: Lucide React
- **Notifications**: React Hot Toast

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
cd houston-inventory
npm install
```

### 2. Environment Variables

Create a `.env.local` file in the root directory with the following variables:-

```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# OpenAI API Configuration
VITE_OPENAI_API_KEY=your_openai_api_key

# Voiceflow API Configuration
VITE_VOICEFLOW_API_URL=your_voiceflow_api_url
VITE_VOICEFLOW_API_KEY=your_voiceflow_api_key
VITE_VOICEFLOW_CALL_API_URL=your_voiceflow_call_api_url
VITE_VOICEFLOW_CALL_API_KEY=your_voiceflow_call_api_key

# Make.com Webhook Configuration
VITE_MAKE_WEBHOOK_URL=your_make_webhook_url
```

### 3. Database Setup

Run the SQL script in `supabase.sql` in your Supabase SQL editor to create all necessary tables and policies.

### 4. Start Development Server

```bash
npm run dev
```

## API Integrations

### Supabase
- **Authentication**: User management and session handling
- **Database**: PostgreSQL with real-time subscriptions
- **Storage**: File uploads and asset management

### OpenAI
- **Inventory Analysis**: AI-powered insights and recommendations
- **Order Optimization**: Smart quantity suggestions
- **Report Generation**: Automated business reports
- **Email Drafting**: Professional reorder emails

### Voiceflow
- **Voice Commands**: Natural language processing for inventory management
- **Order Calls**: Automated phone calls for ordering
- **Call Logging**: Detailed call tracking and analytics

### Make.com
- **Webhooks**: Low stock notifications and alerts
- **Automation**: Integration with external systems

## Usage

### Voice Commands
Try these voice commands:
- "Add 5 Jalen Green jerseys"
- "Order 3 Icon jerseys size 48"
- "Subtract 2 from Fred VanVleet Statement jerseys"

### Dashboard
- View real-time inventory metrics
- Monitor low stock items
- Track recent activity and calls
- Access quick actions

### Inventory Management
- Add, edit, and delete jersey items
- Filter by player, edition, or stock level
- Sort by various criteria
- Export data to CSV
- Place order calls directly from the interface

### Settings
- Configure low stock thresholds
- Set user preferences
- Test integrations
- Generate AI-powered reports
- View integration status

## Database Schema

### Core Tables
- `jerseys`: Main inventory items
- `settings`: System configuration
- `activity_logs`: Audit trail
- `call_logs`: Order call tracking
- `inventory_alerts`: Low stock notifications
- `user_preferences`: User-specific settings
- `inventory_analytics`: Historical data

## Deployment

### Vercel (Recommended)
1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Other Platforms
The app can be deployed to any platform that supports React applications:
- Netlify
- AWS Amplify
- Railway
- Render

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions, please open an issue in the GitHub repository.