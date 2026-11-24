# Contatos de formador 2027 · Inside Sales Curem

App para cada vendedor informar o status das faculdades da sua carteira para 2027 (contato do formador e Campanha 150), sem precisar de conta Claude.

- `index.html`: tela do vendedor (com tour guiado) e tela de administração.
- `api/index.js`: API única (`/api?op=setup|me|mark|import|export`).
- Dados: Upstash Redis via Vercel Marketplace. Nenhum dado de faculdade fica neste repositório; eles são importados pela tela de administração.

## Links
- Vendedor: `https://<projeto>.vercel.app/#v=<token do vendedor>` (só vê e altera a própria carteira).
- Administração: `https://<projeto>.vercel.app/#a=<token de administração>` (vê todos, copia os links, exporta as marcações).
- Os tokens ficam depois do `#`, então não vão para logs de servidor.

## Configuração (uma vez)
1. Importar este repositório no Vercel e fazer o deploy.
2. Storage → Upstash Redis → conectar ao projeto → Redeploy.
3. Abrir `https://<projeto>.vercel.app/api?op=setup` uma única vez: devolve o link de administração (a rota recusa uma segunda configuração).
4. Na administração, importar o JSON `{ sellers, fac }` gerado a partir do Simulador de regiões.

## Volta para o Simulador
O Simulador de regiões (artefato no Claude) não consegue buscar dados de outro site. Para atualizar o painel 2027, use "Exportar marcações" na administração e peça ao Claude para gravar as marcações no Simulador.
