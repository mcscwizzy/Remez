export function GuidePanel() {
  return (
    <div className="card card-edge p-6 guide-panel space-y-4 text-sm leading-relaxed">
      <h2>Quick Start — How to Use Remez</h2>

      <p>
        <strong>Step 1 — Paste the passage text.</strong>
        <br />
        Copy and paste the passage you want to analyze. Any translation works. Remez does not fetch Bible text — it
        analyzes what you provide.
      </p>

      <p>
        <strong>Step 2 — Click Analyze.</strong>
      </p>

      <p>
        <strong>Step 3 — Read in this order:</strong>
      </p>
      <ul>
        <li>Overview (summary and themes)</li>
        <li>Visual (structure diagram)</li>
        <li>Raw (full structured output if debugging)</li>
      </ul>

      <p>
        <strong>Step 4 — Compare translations.</strong>
        <br />
        Structure can look different across translations because wording and word order change. Comparing translations
        often helps repeated phrases and pivots become clearer.
      </p>

      <hr />

      <h2>What You’re Looking At</h2>

      <h3>Overview</h3>
      <p>
        A structured summary of the passage: themes, motifs, worldview notes, and key terms. This is the interpretive
        layer.
      </p>

      <h3>Visual — Structure View</h3>
      <p>
        The vertical flow shows the main movement of thought. Side arrows show parallel relationships. A curved edge
        may indicate a framing device (inclusio).
      </p>

      <h3>Visual — Chiasm View</h3>
      <p>
        This appears only if a chiastic structure is detected. Mirrored levels appear as paired rows. The center
        (pivot) is visually emphasized. If no pivot appears, the passage likely uses parallelism instead.
      </p>

      <h3>Raw</h3>
      <p>The full structured JSON output. Useful for testing and tuning.</p>

      <hr />

      <h2>Parallelism</h2>

      <p>
        Parallelism is the most common structure in Hebrew writing. One line echoes, develops, contrasts, or intensifies
        another.
      </p>

      <ul>
        <li>
          <strong>Synonymous:</strong> repeats the idea in different words
        </li>
        <li>
          <strong>Antithetic:</strong> contrasts the first line
        </li>
        <li>
          <strong>Synthetic:</strong> builds or intensifies the idea
        </li>
      </ul>

      <p>Parallelism develops themes through reinforcement. It does not require a central pivot.</p>

      <hr />

      <h2>Chiasm</h2>

      <p>A chiasm is a mirrored structure:</p>

      <p style={{ marginLeft: 20 }}>
        A
        <br />
        &nbsp;&nbsp;B
        <br />
        &nbsp;&nbsp;&nbsp;&nbsp;C
        <br />
        &nbsp;&nbsp;B’
        <br />
        A’
      </p>

      <p>The center (pivot) is often the emphasis. The outer layers mirror each other.</p>

      <p>Not every structured passage is chiastic. Remez uses a conservative approach.</p>

      <hr />

      <h2>Tips for Better Results</h2>

      <ul>
        <li>Analyze smaller units first (5–20 verses).</li>
        <li>If Chiasm View is blank, look for parallelism instead.</li>
        <li>Compare translations to see how wording affects repetition.</li>
        <li>
          The strongest structural analysis returns to Hebrew/Greek, but meaningful patterns still appear in good
          translations.
        </li>
      </ul>
    </div>
  );
}
