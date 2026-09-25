export default async function* coverageJsonReporter(source) {
  for await (const event of source) {
    if (event.type === "test:coverage") {
      yield JSON.stringify(event.data.summary, null, 2) + "\n";
    }
  }
}
