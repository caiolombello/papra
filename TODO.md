# Papra — Roadmap de Melhorias

## Meetings / Transcrição

- [x] **Status de processamento na UI**
  Adicionar estado intermediário na UI (`uploading → transcribing → done`).
  Hoje o upload some e o meeting aparece só quando pronto.
  ✅ Campo `status` na tabela meetings, placeholder criado no upload, polling no frontend (10s).

- [x] **Resumo automático**
  O campo `summary` existe no schema mas nunca é preenchido.
  ✅ Worker gera summary + título descritivo via gpt-4o-mini após transcrição. Salva no S3 e envia para Papra no ingest. UI já exibe como preview.

- [x] **Diarização (speaker identification)**
  Identificar múltiplos speakers em reuniões.
  ✅ pyannote 3.1 no worker (CPU). Roda pós-transcrição, cruza regiões temporais com segments para atribuir speaker. Config: `DIARIZATION_ENABLED`, `HF_TOKEN`. Resultado salvo em `diarization.json` no S3. UI já exibe `chunk.speaker`.

- [x] **Player de áudio integrado**
  Gerar presigned URL de leitura do `sourceStorageKey` e embutir player na página do meeting.
  Sincronizar com os chunks da transcrição: clicar num trecho pula para aquele ponto do áudio.

- [x] **Re-transcrição**
  Botão na UI para reprocessar um meeting (reenviar mensagem para a fila SQS).
  Útil quando o pipeline melhora e se quer reaplicar nos meetings antigos.

## Documentos

- [x] **Desbloqueio automático de PDFs com senha**
  PDFs de contas (Comgas, CPFL, Enel, etc.) chegam via intake email com senha (geralmente 3 primeiros dígitos do CPF).
  Implementar:
  - Tabela/config de regras de senha por remetente/padrão (ex: `*@comgas.com.br` → senha X, `*@cpfl.com.br` → senha Y)
  - No pipeline de ingestão de documentos, detectar se o PDF é protegido
  - Tentar desbloquear com as senhas mapeadas antes de armazenar
  - Armazenar versão desbloqueada para permitir extração de texto e busca
  - Suportar múltiplos perfis de senha (mãe, pai, próprio) por padrão de remetente
  - UI para gerenciar as regras de senha (remetente → senha)

- [x] **OCR para imagens e scans**
  PDFs escaneados e imagens ficam sem conteúdo buscável.
  ✅ O `@papra/lecture` já implementa OCR completo (Tesseract CLI + JS fallback, PDF page rendering). Bastou adicionar `tesseract-ocr` e `tesseract-ocr-por` ao Dockerfile. Config: `DOCUMENTS_OCR_LANGUAGES=eng,por`.

- [x] **Preview de documentos**
  Renderizar preview/thumbnail de PDFs e imagens na lista de documentos.
  ✅ Componente `DocumentThumbnail` com lazy-load (IntersectionObserver), pdfjs para primeira página de PDFs, `<img>` para imagens, ícone fallback para outros tipos. Cache via TanStack Query.

- [x] **Versionamento de documentos**
  Upload de documento com mesmo nome cria versão nova em vez de duplicar.
  ✅ Tabela `document_versions` para histórico, `versionNumber` em documents. Repository + routes para listar versões. UI mostra "Version History" na detail page com versão atual + anteriores.

## Busca e Organização

- [x] **Busca global (cmd+k)**
  Barra de busca unificada que busca em documentos, meetings, tags e custom properties de uma vez.
  O endpoint `/search` já existe, falta a UI com atalho de teclado.
  ✅ Já implementado no upstream (`command-palette.provider.tsx` com Cmd+K).

- [x] **Tags em meetings**
  Reaproveitar o sistema de tags e tagging rules para meetings.
  ✅ Tabela `meetings_tags`, auto-tag por `context` no ingest (cria tag se não existe), rotas add/remove, tags exibidas nos cards e na detail page com remove.

- [x] **Folders / hierarquia de documentos**
  Documentos são flat hoje.
  ✅ Tabela `document_folders` com hierarquia (parentId), `folderId` na tabela documents. CRUD de folders, filtro por folder na listagem, breadcrumb navigation, grid de subfolders, botão "New Folder". Docs existentes ficam na raiz.

## Infra e Operação

- [x] **Notificação de transcrição concluída**
  Avisar o usuário quando o meeting termina de processar.
  ✅ Browser Notification API — detecta transição processing→completed via polling, dispara notificação com título do meeting. Pede permissão no primeiro upload.

- [x] **Dashboard de custos e uso**
  Painel mostrando stats de meetings na página de Usage.
  ✅ Endpoint `GET /meetings/stats` (total/completed/processing/failed), seção "Meetings" na página de Usage com contadores por status.

- [x] **Cleanup automático de containers e imagens**
  Na EC2 existem 6+ containers parados e imagens antigas.
  Cron job para `docker system prune` ou limpeza seletiva.
  ✅ Script em `scripts/docker-cleanup.sh`.

- [x] **CI/CD com GitHub Actions**
  Hoje o deploy é manual via SSM.
  Workflow que builda a imagem, pusha para ECR e faz rolling update.
  Gatilho: push na main do fork.
  ✅ Workflow em `.github/workflows/deploy-fork.yaml`.
