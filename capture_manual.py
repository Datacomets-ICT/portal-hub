"""
Auto-capture screenshots for the IT Ticket manual.
Logs in to the live site and takes screenshots of every major screen.
Run:  python capture_manual.py
"""

from playwright.sync_api import sync_playwright
import os
import time

URL       = 'https://project-code-gamma.vercel.app'
EMP_ID    = 'Admin'
PASSWORD  = '1234'
OUT_DIR   = 'manual_images'
VIEWPORT  = {'width': 1280, 'height': 800}


def shot(page, name, full_page=False, clip=None):
    path = os.path.join(OUT_DIR, name)
    page.screenshot(path=path, full_page=full_page, clip=clip)
    print(f'  ✓ {name}')


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport=VIEWPORT, locale='th-TH')
        page = context.new_page()

        # ---- 01. Login page ----
        print('▶ Login page')
        page.goto(URL, wait_until='networkidle')
        page.wait_for_selector('#loginForm', timeout=10000)
        time.sleep(1)
        shot(page, '01_login.png')

        # ---- 02. Register page ----
        print('▶ Register page')
        page.click('a[onclick*="pageRegister"]')
        page.wait_for_selector('#registerForm', timeout=5000)
        time.sleep(0.5)
        shot(page, '02_register.png')

        # Back to login & do login
        print('▶ Logging in...')
        page.click('a[onclick*="pageLogin"]')
        page.wait_for_selector('#loginEmpId', timeout=5000)
        page.fill('#loginEmpId', EMP_ID)
        page.fill('#loginPassword', PASSWORD)
        page.click('#loginForm button[type="submit"]')
        page.wait_for_selector('#pageApp.active', timeout=15000)
        time.sleep(2)  # let data load

        # ---- 03. New Ticket page ----
        print('▶ New Ticket page')
        # Already on New Ticket by default
        shot(page, '03_new_ticket.png')

        # ---- 04. Ticket List ----
        print('▶ Ticket List')
        page.click('.nav-links button:has-text("Ticket List")')
        time.sleep(2)
        shot(page, '04_ticket_list.png')

        # ---- 05. Ticket Detail modal ----
        print('▶ Ticket Detail')
        view_btn = page.locator('button[onclick^="viewTicket"]').first
        if view_btn.count() > 0:
            view_btn.click()
            try:
                page.wait_for_selector('#ticketModal.show', timeout=5000)
                time.sleep(1)
                shot(page, '05_ticket_detail.png')
            except Exception as e:
                print(f'  ⚠ ticket detail skipped: {e}')
            page.evaluate("document.getElementById('ticketModal').classList.remove('show')")
            time.sleep(0.5)

        # ---- 06. Admin Edit modal (since Admin account) ----
        print('▶ Admin Edit modal')
        edit_btn = page.locator('button[onclick^="openListEdit"]').first
        if edit_btn.count() > 0:
            edit_btn.click()
            try:
                page.wait_for_selector('#adminEditModal.show', timeout=8000)
                time.sleep(1.5)
                shot(page, '06_admin_edit.png')
            except Exception as e:
                print(f'  ⚠ admin edit skipped: {e}')
            page.evaluate("document.getElementById('adminEditModal').classList.remove('show')")
            time.sleep(0.5)

        # ---- 07. Approval tab (admin) ----
        print('▶ Approval tab')
        try:
            page.click('.nav-links button:has-text("อนุมัติ")', timeout=3000)
            time.sleep(2)
            shot(page, '07_approval.png')
        except Exception as e:
            print(f'  ⚠ approval tab skipped: {e}')

        # Go back to New Ticket for subsequent captures
        page.click('.nav-links button:has-text("เปิด Ticket")')
        time.sleep(1)

        # ---- 08. Notification panel ----
        print('▶ Notification panel')
        page.click('.notif-bell')
        time.sleep(1)
        shot(page, '08_notifications.png')
        page.click('.notif-bell')  # close
        time.sleep(0.5)

        # ---- 09. AI Chatbot panel ----
        print('▶ AI Chatbot')
        page.click('.sb-btn-ai')
        time.sleep(1)
        shot(page, '09_ai_chatbot.png')
        # close
        try:
            page.click('#chatPanel .close-btn', timeout=2000)
        except Exception:
            page.evaluate("document.getElementById('chatPanel').classList.remove('show')")
        time.sleep(0.5)

        # ---- 10. Ticket Chat panel ----
        print('▶ Ticket Chat')
        # Admin should always see ticket chat button because has-ticket-chat class applied
        try:
            page.evaluate("document.body.classList.add('has-ticket-chat')")
            page.click('.sb-btn-ticket', timeout=3000)
            time.sleep(1.5)
            shot(page, '10_ticket_chat.png')
            page.evaluate("document.getElementById('tchatPanel').classList.remove('show')")
        except Exception as e:
            print(f'  ⚠ ticket chat skipped: {e}')
        time.sleep(0.5)

        # ---- 11. 3-dot menu ----
        print('▶ 3-dot menu')
        page.click('.menu-btn')
        time.sleep(0.5)
        shot(page, '11_user_menu.png')
        page.click('.menu-btn')  # close
        time.sleep(0.3)

        # ---- 12. Profile modal (Info tab) ----
        print('▶ Profile - Info tab')
        page.click('.menu-btn')
        time.sleep(0.3)
        page.click('.menu-item:has-text("โปรไฟล์")')
        page.wait_for_selector('#profileModal.show', timeout=5000)
        time.sleep(1)
        shot(page, '12_profile_info.png')

        # ---- 13. Profile - Avatar tab ----
        print('▶ Profile - Avatar tab')
        page.click('.profile-tabs button:has-text("รูปโปรไฟล์")')
        time.sleep(0.5)
        shot(page, '13_profile_avatar.png')

        # ---- 14. Profile - Password tab ----
        print('▶ Profile - Password tab')
        page.click('.profile-tabs button:has-text("รหัสผ่าน")')
        time.sleep(0.5)
        shot(page, '14_profile_password.png')

        # ---- 15. Profile - Theme tab ----
        print('▶ Profile - Theme tab')
        page.click('.profile-tabs button:has-text("ธีม")')
        time.sleep(0.5)
        shot(page, '15_profile_theme.png')

        browser.close()
    print('\n✅ Done. Images saved to', OUT_DIR)


if __name__ == '__main__':
    main()
