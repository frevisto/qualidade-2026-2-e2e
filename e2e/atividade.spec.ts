import { atividadeTest as test, expect } from "./support";

async function fillStudent(page: import("@playwright/test").Page, ra: number, name: string) {
  await page.getByLabel("RA", { exact: true }).fill(String(ra));
  await page.getByLabel("Nome", { exact: true }).fill(name);
}

test("lista os alunos ao abrir a página", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Cadastro de alunos" })).toBeVisible();
  await expect(page.locator("#students")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByTestId("list-message")).toHaveAttribute("data-state", "success");
  await expect(page.getByTestId("student-row")).toHaveCount(3);
  await expect(page.getByRole("cell", { name: "Ana Clara Silva" })).toBeVisible();
});

test("cadastra um aluno e atualiza a tabela sem recarregar", async ({ page }) => {
  await fillStudent(page, 900101, "  Mariana Souza  ");
  await page.getByRole("button", { name: "Cadastrar aluno" }).click();

  await expect(page.getByTestId("form-message")).toHaveText("Aluno cadastrado com sucesso.");
  await expect(page.getByTestId("form-message")).toHaveAttribute("data-state", "success");
  await expect(page.getByTestId("ra")).toHaveValue("");
  await expect(page.getByTestId("name")).toHaveValue("");
  await expect(page.getByRole("row", { name: "900101 Mariana Souza" })).toBeVisible();
  await expect(page.getByTestId("student-row")).toHaveCount(4);
});

test("mantém o cadastro após recarregar a página", async ({ page }) => {
  await fillStudent(page, 900102, "Aluno Persistente");
  await page.getByRole("button", { name: "Cadastrar aluno" }).click();
  await expect(page.getByTestId("form-message")).toHaveAttribute("data-state", "success");

  await page.reload();
  await expect(page.getByRole("row", { name: "900102 Aluno Persistente" })).toBeVisible();
});

test("exige RA e nome", async ({ page }) => {
  await page.getByRole("button", { name: "Cadastrar aluno" }).click();
  await expect(page.getByTestId("ra")).toBeVisible();
  expect(await page.getByTestId("ra").evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  await expect(page.getByTestId("name")).toBeFocused().catch(() => undefined);
});

test("valida os limites dos campos", async ({ page }) => {
  await fillStudent(page, 2147483648, "Nome válido");
  await page.getByRole("button", { name: "Cadastrar aluno" }).click();
  expect(await page.getByTestId("ra").evaluate((input: HTMLInputElement) => input.validity.rangeOverflow)).toBe(true);

  await page.getByTestId("ra").fill("1");
  await page.getByTestId("name").fill("ab");
  await page.getByRole("button", { name: "Cadastrar aluno" }).click();
  expect(await page.getByTestId("name").evaluate((input: HTMLInputElement) => input.validity.tooShort)).toBe(true);

  await page.getByTestId("name").evaluate((input: HTMLInputElement) => {
    input.value = "x".repeat(101);
  });
  await page.getByRole("button", { name: "Cadastrar aluno" }).click();
  await expect(page.getByTestId("form-message")).toHaveAttribute("data-state", "error");
  await expect(page.getByTestId("form-message")).toContainText("O nome deve ter no máximo 100 caracteres");
});

test("aceita os limites válidos dos campos", async ({ page }) => {
  await fillStudent(page, 2147483647, "ABC");
  await page.getByRole("button", { name: "Cadastrar aluno" }).click();
  await expect(page.getByTestId("form-message")).toHaveAttribute("data-state", "success");
  await expect(page.getByRole("row", { name: "2147483647 ABC" })).toBeVisible();

  await fillStudent(page, 900103, "x".repeat(100));
  await page.getByRole("button", { name: "Cadastrar aluno" }).click();
  await expect(page.getByTestId("form-message")).toHaveAttribute("data-state", "success");
});

test("apresenta o erro da API para RA duplicado e preserva os campos", async ({ page }) => {
  await fillStudent(page, 258001, "Nome Duplicado");
  await page.getByRole("button", { name: "Cadastrar aluno" }).click();

  await expect(page.getByTestId("form-message")).toContainText("Já existe um estudante com este RA.");
  await expect(page.getByTestId("form-message")).toHaveAttribute("data-state", "error");
  await expect(page.getByTestId("ra")).toHaveValue("258001");
  await expect(page.getByTestId("name")).toHaveValue("Nome Duplicado");
});

test("apresenta falha de cadastro da API", async ({ page }) => {
  await page.route("**/api/students", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Falha simulada" }) });
    } else {
      await route.continue();
    }
  });
  await fillStudent(page, 900104, "Aluno com falha");
  await page.getByRole("button", { name: "Cadastrar aluno" }).click();

  await expect(page.getByTestId("form-message")).toContainText("Não foi possível cadastrar o aluno. Falha simulada");
  await expect(page.getByTestId("form-message")).toHaveAttribute("data-state", "error");
});

test("apresenta carregamento e falha da listagem", async ({ page }) => {
  await page.route("**/api/students", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Serviço indisponível" }) });
  });

  await page.reload();
  await expect(page.locator("#students")).toHaveAttribute("aria-busy", "true");
  await expect(page.getByTestId("list-message")).toHaveAttribute("data-state", "loading");
  await expect(page.getByTestId("list-message")).toContainText("Não foi possível atualizar a lista");
  await expect(page.getByTestId("list-message")).toHaveAttribute("data-state", "error");
  await expect(page.locator("#students")).toHaveAttribute("aria-busy", "false");
});

test("informa a lista vazia", async ({ page }) => {
  await page.route("**/api/students", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    } else {
      await route.continue();
    }
  });
  await page.reload();
  await expect(page.getByTestId("list-message")).toHaveText("Nenhum aluno cadastrado.");
  await expect(page.getByTestId("list-message")).toHaveAttribute("data-state", "success");
  await expect(page.getByTestId("student-row")).toHaveCount(0);
});
