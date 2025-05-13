# Projeção de Eventos

Este projeto Angular implementa uma ferramenta de projeção de eventos futuros baseada em ciclos e prioridades, com visualização gráfica interativa.

## Demonstração

![Demonstração do Projeto Projeção de Eventos](src/app/data/projecao_eventos.gif)

## Requisitos de Sistema

- **Node.js**: v18.x ou superior
- **npm**: v9.x ou superior
- **Angular CLI**: v19.x

## Instalação

Siga estas etapas para configurar o projeto localmente:

```bash
# Clone o repositório (caso ainda não tenha feito)
git clone https://github.com/seu-usuario/projecao-eventos.git
cd projecao-eventos

# Instale as dependências
npm install
```

## Executando o Projeto

Para iniciar o servidor de desenvolvimento:

```bash
npm start
```

ou

```bash
ng serve
```

O aplicativo estará disponível em `http://localhost:4200/`.

## Recursos Principais

- **Projeção de Eventos**: Visualize eventos futuros com base em ciclos definidos
- **Priorização de Ciclos**: Selecione ciclos de alta, média ou baixa prioridade
- **Visualização Gráfica**: Gráfico de barras empilhadas mostrando a distribuição de eventos
- **Distribuição Inteligente**: Sistema que distribui entidades com base nas prioridades

## Estrutura de Componentes

- **EventProjectionComponent**: Componente principal para projeção de eventos
- **Ciclos**: Representam fluxos de trabalho com diferentes prioridades (HIGH, MEDIUM, LOW, NEUTRAL)
- **Eventos**: Categorizados em Encontros, Mensagens, Checkpoints e Exploração

## Dependências Principais

- **Angular**: Framework base (v19.2.x)
- **Angular Material**: Componentes de UI (v19.2.x)
- **Chart.js**: Biblioteca para gráficos (v4.4.x)
- **RxJS**: Programação reativa (v7.8.x)

## Construção para Produção

Para criar uma build de produção otimizada:

```bash
npm run build
```

ou

```bash
ng build --configuration production
```

Os arquivos de build serão armazenados no diretório `dist/`.

## Testes

### Testes Unitários

```bash
npm test
```

### Testes End-to-End

```bash
npm run e2e
```

## Servidor SSR (Server-Side Rendering)

Para rodar o aplicativo com renderização do lado do servidor:

```bash
npm run serve:ssr:projecao-eventos
```

## Personalização

O componente de projeção de eventos pode ser personalizado por meio de:

- Ajuste das cores do gráfico em `chartColors`
- Configuração dos labels em `eventLabels`
- Modificação das opções do gráfico em `getChartOptions()`
- Ajuste da distribuição de entidades em `distributeEntities()`

## Recursos Adicionais

Para mais informações sobre:

- Angular CLI: [Angular CLI Overview](https://angular.dev/tools/cli)
- Angular Material: [Documentação oficial](https://material.angular.io/)
- Chart.js: [Documentação](https://www.chartjs.org/docs/latest/)

## Licença

[MIT](LICENSE)
