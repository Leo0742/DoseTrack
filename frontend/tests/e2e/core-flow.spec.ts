import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("/tmp/dosetrack-feature-batch", { recursive: true });

function moscowDate(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
const pngPath = "/tmp/dosetrack-feature-batch/avatar.png";
const pdfPath = "/tmp/dosetrack-feature-batch/analysis.pdf";
writeFileSync(pdfPath, pdf);

async function login(page: import("@playwright/test").Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email или логин").fill(username);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 15_000 });
}

async function noHorizontalOverflow(page: import("@playwright/test").Page, route: string) {
  await page.goto(route);
  await expect(page.locator("main")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    `${route} should not overflow horizontally`,
  ).toBe(true);
}

test("patient and doctor full feature regression", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const today = moscowDate();

  await login(page, "owner", "correct-horse-battery");

  await page.goto("/profile");
  await page.getByLabel("Email").fill("owner-updated@example.com");
  await page.getByLabel("Имя").fill("Demo");
  await page.getByLabel("Фамилия").fill("Patient");
  await page.screenshot({ path: pngPath, clip: { x: 0, y: 0, width: 64, height: 64 } });
  const avatarResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/auth/avatar") && response.request().method() === "POST",
  );
  await page.locator(".profile-avatar-action input[type=file]").setInputFiles(pngPath);
  const avatarResponse = await avatarResponsePromise;
  const avatarBody = await avatarResponse.text();
  expect(avatarResponse.status(), avatarBody).toBe(200);
  await expect(page.locator(".profile-avatar img")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByRole("button", { name: "Сохранено" })).toBeVisible();
  await expect(page.getByText("owner-updated@example.com", { exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/dosetrack-feature-batch/profile-desktop.png", fullPage: true });

  await page.goto("/settings");
  await page.getByLabel("Дата начала").fill(today);
  await page.getByLabel("Целевая суммарная доза, мг").fill("320");
  await page.getByRole("button", { name: "Создать лечение" }).click();
  await expect(page.getByRole("heading", { name: "Текущая назначенная схема" })).toBeVisible();

  await page.getByLabel("Действует с").fill(today);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/treatment/regimens") && response.request().method() === "POST" && response.ok()),
    page.getByRole("button", { name: "Сохранить схему" }).click(),
  ]);
  const before = await page.evaluate(async () => (await fetch("/api/treatment")).json());
  expect(before.daily_planned_mg).toBe(32);
  expect(before.estimated_days).not.toBeNull();

  await page.getByLabel("Утро — мг").fill("32");
  await page.getByLabel("Вечер — мг").fill("32");
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/treatment/regimens") && response.request().method() === "POST" && response.ok()),
    page.getByRole("button", { name: "Сохранить схему" }).click(),
  ]);
  const after = await page.evaluate(async () => (await fetch("/api/treatment")).json());
  expect(after.daily_planned_mg).toBe(64);
  expect(after.estimated_days).toBeLessThan(before.estimated_days);
  expect(after.estimated_completion_date).toBeTruthy();

  await page.goto("/today");
  await expect(page.getByText("64 mg по плану", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Принял" }).first().click();
  await expect(page.getByText("+32 mg · приём отмечен", { exact: true })).toBeVisible();
  await expect(page.getByText("10% выполнено", { exact: true })).toBeVisible();
  await expect(page.getByText("Дата начала курса", { exact: true })).toBeVisible();
  await expect(page.getByText("Ориентировочное завершение", { exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/dosetrack-feature-batch/today-desktop.png", fullPage: true });

  await page.goto("/photos");
  await page.getByPlaceholder("Папки").fill("E2E фото");
  await page.getByRole("button", { name: "Создать" }).click();
  const photoRoot = page.locator(".folder-card-open").filter({ hasText: "E2E фото" });
  await expect(photoRoot).toBeVisible();
  await photoRoot.click();
  await page.getByPlaceholder("Папки").fill("Неделя 1");
  await page.getByRole("button", { name: "Создать" }).click();
  await page.locator(".folder-card-open").filter({ hasText: "Неделя 1" }).click();
  await page.getByRole("button", { name: "Добавить фото" }).click();
  await page.getByLabel("Изображение").setInputFiles(pngPath);
  await page.getByLabel("Название").fill("E2E фото прогресса");
  await page.getByRole("button", { name: "Сохранить фото" }).click();
  await expect(page.getByText("E2E фото прогресса", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Свернуть папки" }).click();
  await expect(page.getByRole("button", { name: "Показать папки" })).toBeVisible();
  await page.screenshot({ path: "/tmp/dosetrack-feature-batch/photos-desktop.png", fullPage: true });

  await page.goto("/documents");
  await page.getByPlaceholder("Папки документов").fill("E2E документы");
  await page.getByRole("button", { name: "Создать" }).click();
  await page.locator(".folder-card-open").filter({ hasText: "E2E документы" }).click();
  await page.getByPlaceholder("Папки документов").fill("Анализы");
  await page.getByRole("button", { name: "Создать" }).click();
  await page.locator(".folder-card-open").filter({ hasText: "Анализы" }).click();
  await page.getByRole("button", { name: "Загрузить" }).click();
  const documentForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Загрузить документ" }) });
  await documentForm.locator('input[type="file"]').setInputFiles(pdfPath);
  await documentForm.locator('input:not([type="file"]):not([type="date"])').first().fill("E2E контрольный анализ крови с длинным названием");
  await documentForm.getByRole("button", { name: "Загрузить документ" }).click();
  await expect(page.getByText("E2E контрольный анализ крови с длинным названием", { exact: true })).toBeVisible();
  await page.getByText("E2E контрольный анализ крови с длинным названием", { exact: true }).click();
  const pdfPreview = page.locator('iframe[title="E2E контрольный анализ крови с длинным названием"]');
  await expect(pdfPreview).toBeVisible();
  const pdfResponse = await page.request.get(await pdfPreview.getAttribute("src") as string);
  expect(pdfResponse.status()).toBe(200);
  expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");
  await page.screenshot({ path: "/tmp/dosetrack-feature-batch/documents-desktop.png", fullPage: true });

  await page.goto("/diary");
  await page.getByRole("button", { name: "Новая запись" }).click();
  const diaryForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Добавить запись" }) });
  await diaryForm.locator("input.input").fill("E2E дневник");
  await diaryForm.locator("textarea").fill("Самочувствие нормальное, тестовая запись.");
  await diaryForm.getByRole("button", { name: "Сохранить запись" }).click();
  const entry = page.locator("article.diary-card").filter({ hasText: "E2E дневник" });
  await expect(entry).toBeVisible();
  await entry.getByRole("button", { name: "Редактировать запись" }).click();
  const diaryEditForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Редактировать запись" }) });
  await diaryEditForm.getByLabel("Название").fill("E2E дневник — изменён");
  await diaryEditForm.getByLabel("Категория").selectOption("skin");
  await diaryEditForm.getByLabel("Выраженность").selectOption("3");
  await diaryEditForm.getByLabel("Что вы заметили?").fill("Самочувствие хорошее, запись отредактирована.");
  await diaryEditForm.getByRole("button", { name: "Сохранить изменения" }).click();
  await expect(entry.getByText("E2E дневник — изменён", { exact: true })).toBeVisible();
  await expect(entry.getByText("Самочувствие хорошее, запись отредактирована.", { exact: true })).toBeVisible();
  await entry.getByPlaceholder("Добавить комментарий…").fill("Комментарий пациента");
  await entry.getByRole("button", { name: "Отправить комментарий" }).click();
  await expect(entry.getByText("Комментарий пациента", { exact: true })).toBeVisible();
  await entry.getByRole("button", { name: "Редактировать комментарий" }).click();
  await entry.locator(".comment-edit textarea").fill("Комментарий пациента — изменён");
  await entry.locator(".comment-edit").getByRole("button", { name: "Сохранить" }).click();
  await expect(entry.getByText("Комментарий пациента — изменён", { exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/dosetrack-feature-batch/diary-desktop.png", fullPage: true });

  await page.goto("/calendar");
  await expect(page.getByText("Выпито за месяц", { exact: true })).toBeVisible();
  await expect(page.locator(".metric").filter({ hasText: "Выпито за месяц" })).toContainText("32 mg");
  await page.locator(".calendar-day").filter({ hasText: String(new Date().getDate()) }).first().click();
  await expect(page.getByText("Заметки дневника", { exact: true })).toBeVisible();
  const calendarEntry = page.locator("article.diary-card").filter({ hasText: "E2E дневник — изменён" });
  await expect(calendarEntry).toBeVisible();
  await calendarEntry.getByRole("button", { name: "Редактировать запись" }).click();
  const calendarEditForm = page.locator("form").filter({ has: page.getByText("Редактировать запись", { exact: true }) });
  await calendarEditForm.getByLabel("Название").fill("E2E дневник — календарь");
  await calendarEditForm.getByLabel("Что вы заметили?").fill("Запись изменена прямо из календаря.");
  await calendarEditForm.getByRole("button", { name: "Сохранить изменения" }).click();
  await expect(page.getByText("E2E дневник — календарь", { exact: true })).toBeVisible();
  const updatedCalendarEntry = page.locator("article.diary-card").filter({ hasText: "E2E дневник — календарь" });
  await updatedCalendarEntry.getByPlaceholder("Добавить комментарий…").fill("Комментарий из календаря");
  await updatedCalendarEntry.getByRole("button", { name: "Отправить комментарий" }).click();
  const calendarComment = updatedCalendarEntry.locator(".comment-bubble").filter({ hasText: "Комментарий из календаря" });
  await expect(calendarComment).toBeVisible();
  await calendarComment.getByRole("button", { name: "Редактировать комментарий" }).click();
  await calendarComment.locator(".comment-edit textarea").fill("Комментарий из календаря — изменён");
  await calendarComment.locator(".comment-edit").getByRole("button", { name: "Сохранить" }).click();
  await expect(updatedCalendarEntry.getByText("Комментарий из календаря — изменён", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Добавить заметку" }).click();
  const calendarCreateForm = page.locator("form").filter({ has: page.getByText("Новая заметка", { exact: true }) });
  await calendarCreateForm.getByLabel("Название").fill("Новая заметка из календаря");
  await calendarCreateForm.getByLabel("Категория").selectOption("general wellbeing");
  await calendarCreateForm.getByLabel("Выраженность").selectOption("2");
  await calendarCreateForm.getByLabel("Что вы заметили?").fill("Создано прямо из выбранного дня календаря.");
  await calendarCreateForm.getByRole("button", { name: "Сохранить заметку" }).click();
  await expect(page.getByText("Новая заметка из календаря", { exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/dosetrack-feature-batch/calendar-desktop.png", fullPage: true });

  await page.goto("/settings");
  await page.getByLabel("Период выписки").selectOption("custom");
  await page.getByLabel("С", { exact: true }).fill(today);
  await page.getByLabel("По", { exact: true }).fill(today);
  const excel = page.getByRole("link", { name: "Скачать Excel-выписку" });
  await expect(excel).toHaveAttribute("href", new RegExp(`start=${today}.*end=${today}`));
  const [download] = await Promise.all([page.waitForEvent("download"), excel.click()]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  await download.saveAs("/tmp/dosetrack-feature-batch/dosetrack-treatment-statement.xlsx");

  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/today", "/profile", "/photos", "/documents", "/diary", "/calendar", "/settings"]) {
    await noHorizontalOverflow(page, route);
  }
  await page.goto("/today");
  await page.screenshot({ path: "/tmp/dosetrack-feature-batch/today-mobile.png", fullPage: true });
  await page.goto("/photos");
  await page.screenshot({ path: "/tmp/dosetrack-feature-batch/photos-mobile.png", fullPage: true });
  await page.goto("/calendar");
  await page.locator(".calendar-day").filter({ hasText: String(new Date().getDate()) }).first().click();
  await expect(page.getByText("Заметки дневника", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "selected calendar day should not overflow horizontally").toBe(true);
  await page.screenshot({ path: "/tmp/dosetrack-feature-batch/calendar-mobile.png", fullPage: true });

  const doctorContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const doctorPage = await doctorContext.newPage();
  await login(doctorPage, "doctor", "doctor-demo-password");
  await doctorPage.goto("/diary");
  await expect(doctorPage.getByRole("button", { name: "Новая запись" })).toHaveCount(0);
  const doctorEntry = doctorPage.locator("article.diary-card").filter({ hasText: "E2E дневник" });
  await expect(doctorEntry.getByText("Комментарий пациента — изменён", { exact: true })).toBeVisible();
  await expect(doctorEntry.getByRole("button", { name: "Редактировать запись" })).toHaveCount(0);
  await expect(doctorEntry.getByRole("button", { name: "Редактировать комментарий" })).toHaveCount(0);
  await doctorEntry.getByPlaceholder("Добавить комментарий…").fill("Комментарий врача");
  await doctorEntry.getByRole("button", { name: "Отправить комментарий" }).click();
  await expect(doctorEntry.getByText("Комментарий врача", { exact: true })).toBeVisible();
  await doctorEntry.getByRole("button", { name: "Редактировать комментарий" }).click();
  await doctorEntry.locator(".comment-edit textarea").fill("Комментарий врача — изменён");
  await doctorEntry.locator(".comment-edit").getByRole("button", { name: "Сохранить" }).click();
  await expect(doctorEntry.getByText("Комментарий врача — изменён", { exact: true })).toBeVisible();

  await doctorPage.goto("/calendar");
  await doctorPage.locator(".calendar-day").filter({ hasText: String(new Date().getDate()) }).first().click();
  await expect(doctorPage.getByText("Заметки дневника", { exact: true })).toBeVisible();
  await expect(doctorPage.getByRole("button", { name: "Добавить заметку" })).toHaveCount(0);
  const doctorCalendarEntry = doctorPage.locator("article.diary-card").filter({ hasText: "E2E дневник — календарь" });
  await expect(doctorCalendarEntry).toBeVisible();
  await expect(doctorCalendarEntry.getByRole("button", { name: "Редактировать запись" })).toHaveCount(0);
  await doctorCalendarEntry.getByPlaceholder("Добавить комментарий…").fill("Комментарий врача из календаря");
  await doctorCalendarEntry.getByRole("button", { name: "Отправить комментарий" }).click();
  const doctorCalendarComment = doctorCalendarEntry.locator(".comment-bubble").filter({ hasText: "Комментарий врача из календаря" });
  await expect(doctorCalendarComment).toBeVisible();
  await doctorCalendarComment.getByRole("button", { name: "Редактировать комментарий" }).click();
  await doctorCalendarComment.locator(".comment-edit textarea").fill("Комментарий врача из календаря — изменён");
  await doctorCalendarComment.locator(".comment-edit").getByRole("button", { name: "Сохранить" }).click();
  await expect(doctorCalendarEntry.getByText("Комментарий врача из календаря — изменён", { exact: true })).toBeVisible();

  await doctorPage.goto("/photos");
  await expect(doctorPage.getByRole("button", { name: "Добавить фото" })).toHaveCount(0);
  await expect(doctorPage.getByPlaceholder("Папки")).toHaveCount(0);
  await doctorPage.goto("/documents");
  await expect(doctorPage.getByRole("button", { name: "Загрузить", exact: true })).toHaveCount(0);
  await expect(doctorPage.getByPlaceholder("Папки документов")).toHaveCount(0);
  await doctorPage.screenshot({ path: "/tmp/dosetrack-feature-batch/doctor-documents-desktop.png", fullPage: true });

  await doctorPage.setViewportSize({ width: 390, height: 844 });
  await noHorizontalOverflow(doctorPage, "/diary");
  await doctorPage.screenshot({ path: "/tmp/dosetrack-feature-batch/doctor-diary-mobile.png", fullPage: true });
  await doctorContext.close();
});
