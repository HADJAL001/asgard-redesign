"use client"

import { useEffect } from "react"

/**
 * The former guest code sandbox had no production generation API behind it.
 * Keep old shared URLs useful by sending people to the verified project flow:
 * idea -> interview -> generation.
 */
export default function StudioPage() {
  useEffect(() => {
    window.location.replace("/")
  }, [])

  return <main aria-busy="true" style={{ minHeight: "100vh" }} />
}
