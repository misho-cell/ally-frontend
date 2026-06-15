Read CLAUDE.md carefully.

Build the complete Ally PWA. Start with the foundation:

1. Configure next.config.ts for PWA using next-pwa
   - cache all static assets
   - works offline

2. Update src/app/layout.tsx
   - PWA meta tags (viewport, theme-color, apple-mobile-web-app)
   - manifest link
   - mobile fullscreen setup

3. Create public/manifest.json
   - name: "Ally"
   - short_name: "Ally"
   - display: standalone
   - background_color: #ffffff
   - theme_color: #1a1a2e
   - icons: 192x192 and 512x512 (create simple placeholder icons)

4. Create src/lib/api.ts
   - base fetch wrapper that adds Authorization header automatically
   - reads token from localStorage
   - if 401 response → clear token, redirect to /login
   - handles network errors gracefully

5. Create src/app/login/page.tsx
   - two tabs: Login and Register
   - calls POST /auth/login and POST /auth/register
   - on success: saves JWT to localStorage, redirects to /chat
   - mobile-first design with Tailwind

6. Create src/app/chat/page.tsx
   - full screen chat interface
   - message bubbles (user right/blue, Claude left/grey)
   - fixed input bar at bottom
   - loading spinner while waiting for response
   - calls POST /chat/message
   - auto-scroll to latest message

7. Create src/app/page.tsx
   - checks localStorage for JWT token
   - if exists → redirect to /chat
   - if not → redirect to /login

Follow all rules in CLAUDE.md. Mobile-first. No any types.